---
name: fix-pr
description: 'Resolve the review comments on a pull request: check out the PR branch, fact-check every comment before acting on it, and work through the confirmed ones one by one with recommended, trade-off-annotated fixes — in interactive, hybrid, or auto mode. Every code change is TDD: a red test proving the comment first, then the fix turns it green, and the test is committed with the change. Pushes one combined commit, then asks before replying to or resolving any thread. Headless-safe when driven by another skill: coerces to auto, never blocks on a question, and returns a structured report instead of asking. Biased toward secure, maintainable, easy-to-understand code. Use when asked to address, fix, or work through PR review comments/feedback, or /fix-pr.'
---

# fix-pr — work a PR's review comments to resolution, truth first

**A review comment is a claim, not an order.** Reviewers are sometimes wrong — about the code, about the API, about what the fix should be. So no comment is acted on until it has been fact-checked, and no non-obvious fix is implemented until *it* has been fact-checked too. The bias, when choosing between valid fixes, is fixed and explicit: **security first, then maintainability, then ease of understanding** — cleverness, micro-optimisation, and minimal-diff convenience lose to those every time.

## Step 0 — Resolve the PR and check out its branch

1. Identify the PR from the argument (number, URL, or current branch):
   - **GitHub** → `gh pr view <n> --json number,url,title,headRefName,baseRefName`.
   - **Azure DevOps** → delegate resolution and all later thread mechanics to [azure-devops-pr-review](../azure-devops-pr-review/SKILL.md).
2. Check out the PR head branch (`gh pr checkout <n>`, or fetch + checkout). If the current checkout is on unrelated dirty work, use a worktree instead of disturbing it.
3. Pull the review threads — **unresolved/active only** by default:
   - **GitHub** → `gh api repos/{owner}/{repo}/pulls/<n>/comments` for inline comments and `gh pr view --json reviews,comments` for review bodies; group into threads and drop resolved ones (GraphQL `reviewThreads.isResolved` is the reliable source for resolution state).
   - **Azure DevOps** → threads API via the sibling skill; keep `status=active`.
4. Present the inventory: a numbered list (`C1`, `C2`, …) with file:line, author, and a one-line gist. This numbering is used everywhere below.

## Step 1 — Pick the mode

If the invocation didn't name one, ask: **hybrid** (default), **interactive**, or **auto**.

- **interactive** — every confirmed comment is presented to the user with options; the user picks.
- **hybrid** (default) — mechanical comments (formatting, typos, naming nits, missing `using`/import, obvious null-guard, lint findings) are fixed autonomously by subagents; everything substantive goes through the interactive flow. Only the substantive ones ever reach the user.
- **auto** — nothing is presented mid-run; every confirmed comment gets the recommended fix. The end-of-run consent gate (Step 4) still applies in every mode.

**Headless invocation** (driven by another skill — e.g. [sdlc-old-fashioned](../sdlc-old-fashioned/SKILL.md), `go-go-go`, `nights-watch` — or any context with no user to answer) is not a fourth mode but a constraint: see [Headless — driven by another skill](#headless--driven-by-another-skill). Detect it when the caller says so, or when the run is a subagent/Workflow with no interactive user; never block a headless run on a question.

## Step 2 — Fact-check every comment (all modes, no exceptions)

For each comment, before any fix is considered, run [fact-check](../fact-check/SKILL.md) on the comment's claim:

- **Executable claims** ("this throws on empty input", "this regex misses X", "this leaks the handle") → minimal runnable snippet or targeted test, with the snippet and its actual output kept as evidence.
- **Codebase claims** ("this duplicates Y", "callers rely on Z") → exact `path:line` citations found by grep.
- **Doc/API/standard claims** ("this API is deprecated", "the spec requires…") → two or more authoritative sources, deep-linked.

Verdicts:
- **Confirmed** → proceed to Step 3.
- **Refuted** → do **not** implement anything. Record the refutation with its evidence; in interactive/hybrid mode show it to the user immediately (they may still want a change — reviewer intent can be right even when the stated reason is wrong). In auto mode it becomes a drafted reply for Step 4, never a silent skip.
- **Unverifiable** → treat as substantive and interactive in every mode; never auto-fix on an ungrounded claim.

## Step 3 — Resolve, one comment at a time

Work the list **one comment to conclusion, then the next** — no half-open threads. For each confirmed comment:

1. **Generate every honestly good candidate resolution** — all viable, secure, genuinely defensible options, not an artificial shortlist; if the solution space holds five good fixes, present five. Only when there is really no good option does 2–3 become the *lower* limit: present the least-bad 2–3 with their problems stated plainly. Each candidate carries its trade-offs, exactly one is marked **recommended**, and the weak ones are marked as such with the reason. Rank by the house bias: a fix that closes a security gap beats one that preserves an existing convenience; a boring, readable fix beats a clever one; a fix that leaves the code easier for the next reader beats a smaller diff.
2. **Fact-check every non-obvious candidate** before offering or applying it: verify it is actually implementable here (the API exists at the pinned version, the pattern compiles, the config key is real) *and* that it actually resolves the comment's issue — a plausible fix that doesn't survive a snippet run is not an option, it's a guess.
3. **Trace ripple effects — always, for every candidate before it is offered or applied.** A fix that is correct at the comment's line can still break the system around it. For anything the candidate would change — a signature, a return/error contract, an invariant, validation behaviour, a config key, timing/ordering — grep the repo for callers and dependents (`git grep`) and check what relies on the current behaviour (mirrors [code-review-grill](../code-review-grill/SKILL.md) Step 3). A candidate with unaddressed ripple is either extended to cover its dependents or demoted to not-recommended with the ripple named; ripple discovered on the chosen fix is handled in the same change, and its dependents get covered by the TDD tests below.
4. **Route by mode:**
   - **interactive** → present the options (AskUserQuestion fits well: recommended first, trade-offs in the descriptions), implement the user's pick.
   - **hybrid** → mechanical comments go to autonomous fixers — a dynamic [Workflow](../orchestrate/SKILL.md) of Sonnet-tier subagents is the recommended shape (one agent per comment, `isolation: 'worktree'` only if they'd touch the same files concurrently; otherwise a simple sequential pipeline is cheaper). Substantive comments follow the interactive route.
   - **auto** → implement the recommended option. Per-issue dynamic Workflow or synchronous main-context fixes are both legitimate — pick per situation: independent, non-overlapping comments parallelise well; entangled ones (same file, same invariant) are safer sequential in one context.
5. **Fix in TDD fashion — always.** Every code change follows red → green, in every mode, including subagent fixers:
   - **Red first**: write the test that proves the comment's point — it must fail against the current code, for the stated reason, before any production code is touched. The fact-check snippet from Step 2 is usually the seed of this test; promote it into the suite rather than discarding it. A test that passes before the fix proves nothing and is rejected as a false red.
   - **Green by fixing the code**, not by weakening the test. Run the test again and show it passing.
   - **Tests are permanent**: the red-turned-green test is preserved and committed alongside the fix — never deleted, skipped, or left out of the commit. It is the regression guard that keeps the reviewer's finding fixed.
   - The only exemption is a change with no observable behaviour to assert on (pure formatting, comment wording, a rename with no semantic effect) — there, run the existing suite green instead and say so; anything a test *could* distinguish gets one.
6. Log the outcome per comment: `C<n> → fixed (option chosen, evidence)` / `refuted (evidence)` / `needs-discussion`.

Repeat until the inventory is exhausted.

## Step 4 — Combined commit, push, then ask about replies

1. **One combined commit** for the run (or a small series if the fixes are genuinely unrelated), whose message maps comments to resolutions (`Address review: C1 guard null stream, C2 rename per review, …`). The commit contains the new tests together with the fixes they prove — a fix without its red-turned-green test is not ready to commit. Push it to the PR branch — the push is automatic; it is the normal, expected next step of "fix my PR".
2. **Then stop and ask** — never auto-post to the review conversation (headless runs don't ask: they follow the caller's `reply=`/`resolve=` policy, defaulting to draft-only — see [Headless](#headless--driven-by-another-skill)):
   - *Reply to each thread with how it was addressed?* Drafted replies cite the fix commit and, for refuted comments, the refuting evidence (politely: "checked this — see snippet/output; happy to change it anyway if you prefer").
   - *Resolve/close the threads that were fixed?* GitHub → resolve via GraphQL `resolveReviewThread`; Azure DevOps → set thread status `fixed`/`closed` via [azure-devops-pr-review](../azure-devops-pr-review/SKILL.md).
3. Post only what the user approves; post one reply first, confirm it landed, then the rest. Refuted threads are replied to but left **unresolved** unless the user says otherwise — the reviewer gets to disagree.

## Headless — driven by another skill

When another skill or an unattended context invokes fix-pr, there is no user to pick options or grant consent — the **caller is the principal**, and a question that would block the run is a bug. The rules:

1. **Mode coerces to auto.** Interactive and the interactive half of hybrid are impossible; every confirmed comment gets the recommended fix. All the invariants that don't need a human still hold in full: fact-check gate, ripple trace, TDD red→green with tests committed, house bias.
2. **What would have been a question becomes a report line.** Unverifiable comments, refuted comments, and confirmed-but-declined items (e.g. a comment asking to weaken security) are **not** silently decided and **not** blocked on — they are skipped with the evidence recorded and returned to the caller as `needs-discussion`, exactly as a human would have received them.
3. **Posting follows the caller's stated policy, never a guess.** The caller may pass `reply=post|draft` and `resolve=fixed|none`. If the caller specified nothing, the safe default is **draft, post nothing**: pushing the fix commit is still automatic (it is the point of the run), but replies and thread resolution stay as drafted text in the report — "never auto-post to the review conversation" survives headless mode by routing the consent to the principal, not by dropping it.
4. **Return a structured report** the caller can consume without re-reading the run: per-comment outcome (`C<n> → fixed <option> | refuted <evidence> | needs-discussion <why>`), the fix commit SHA(s), the tests added, the ripple findings handled, and the drafted (or posted) replies. sdlc-old-fashioned-style callers feed this straight into their own review/retrospective steps.

## The house bias (what "best option" means here)

When candidates tie on correctness, rank them by, in order:
1. **Security** — validate at the boundary, fail closed, least privilege, no secrets in code or logs. A comment that *weakens* security (e.g. "just catch and ignore") is confirmed-but-declined: present the concern instead of the fix.
2. **Maintainability** — the fix the next person can safely modify: named intent, no duplicated knowledge, invariants enforced in one place.
3. **Ease of understanding** — boring and explicit over clever; if the fix needs a comment to be believed, prefer the version that doesn't.
Micro-performance, diff size, and "matches what I'd have written" rank below all three and never override them.
