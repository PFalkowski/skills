---
name: code-review-grill
description: 'Adversarially review a branch, PR or diff with a fresh agent that did not write it.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# code-review-grill — adversarial "grilling" code review by a fresh agent

**The reviewer is never the author.** The calling session acts only as **orchestrator + synthesizer**: it preps the diff, spawns *fresh* `Agent` subagents to do all the critiquing, and consolidates.

Apply [grill-me](https://github.com/mattpocock/skills)'s question-by-question discipline to the diff.

## The grilling stance (how every reviewer works)

Adapted from grill-me's interrogation discipline, applied to code:
- **One thread at a time.** Resolve each hunk and its dependent questions before moving on.
- **Interrogate.** Ask what must hold, what input breaks it, who relied on old behaviour, and what the author assumed: [inversion](../invert/SKILL.md) applied to a diff.
- **Ask "is this the only one?"** For every *fix*, the follow-up question is *where else does this exact shape live, and why is it not fixed here too?* — see [Step 3](#step-3--trace-ripple-effects).
- **Verify, never speculate.** Run executable doubts, grep codebase doubts, check docs for API claims. The claim determines the method ([Step 5](#step-5--run-the-review-fresh-adversarial-grilling)); an un-run hypothesis is not a finding.
- **Carry a recommended answer.** Like grill-me proposing an answer per question, every finding ships a concrete suggested fix.

## Step 0 — Pick the stance (ask, unless this is a re-review)

Unless the PR was grilled before, ask the user: **single adversarial agent** or **quorum**?
- **Single** — one fresh reviewer over the whole diff. Fast, cheap, good default for small/contained changes.
- **Quorum** — one fresh subagent per concern, run in parallel, each with a sharp brief (objective / output / tools / boundaries) and effort sized to the diff. If the user names concerns, use exactly those; if not, the orchestrator picks the relevant subset from the diff. Concern menu + the auto-pick heuristic live in **[REFERENCE.md](REFERENCE.md)**.
- **Re-review** (the PR was grilled before) — no ask: single, one fresh reviewer, briefed with what survives of the previous round and only the delta since the last reviewed head. It scores each previous fix fixed / partial / regressed and grills only the delta (REFERENCE, § Re-review).

> **Azure DevOps PRs:** delegate the whole resolve → diff → post pipeline to
> [AZURE-DEVOPS.md](AZURE-DEVOPS.md) (its steps 1–5) from the start, not
> just Step 7's posting — it already solves PR-metadata lookup, the diffs-API workaround, and
> full-context file reading, so Steps 1–3 below are for the generic/GitHub-or-local case.

## Step 1 — Resolve the base

Default to the repo's **default branch**: `git symbolic-ref --short refs/remotes/origin/HEAD` (fallback `main`, then `master`). If the user named a PR, use that PR's base branch. State the resolved base and let the user override before diffing.

## Step 2 — Get the diff (merge-base, full context)

Three-dot so you see **only this branch's changes**, not unrelated base drift:
```bash
git fetch origin <base>
git diff --stat <base>...HEAD
git diff       <base>...HEAD
```
Read the changed files at **full context**, not just the hunks — a change is only correct in the surrounding code (mirrors `AZURE-DEVOPS.md` step 3). On a re-review, the delta is `<last-reviewed-head>..HEAD`, the head the newest summary thread names (REFERENCE, § Re-review); the full three-dot diff is context only. With no summary thread, review the full three-dot diff and say so.

Consider a PR-head worktree (`git worktree add`) for full-file reads, ripple searches and accurate inline line numbers without disturbing the user's checkout. This is a checkout, not restore/build. For small diffs, `git show <ref>:<path>` may suffice; ask before creating a worktree in a large/heavy repo where checkout cost is unclear.

## Step 3 — Trace ripple effects

For every changed public symbol, signature, invariant, or config key, grep callers and dependents **repo-wide** (`git grep`, on the worktree if you made one, or on the ref directly if not). An invariant dropped in one file may be silently relied on in another. The lead gathers this dependent set once and hands it to the reviewer(s) so they judge the change in context, not in isolation.

For every fix, also name and grep its defect shape (e.g. swallowed exit code, missing guard), not just its symbol. Require an explanation for untouched parallel sites. Report each sibling as fixed-here, explicitly-triaged, or `scope: sibling`; the bar carries sibling findings to a class ticket, never a PR blocker.

**CI establishes only the baseline**, never an individual finding. Check `gh pr checks` or Azure DevOps status/build info first; if CI is absent or inaccessible, use judgment about a local baseline build/test. Every executable finding still requires an actually run minimal repro or targeted test, with real output.

## Step 4 — Capture the house rules (docs, ADRs, conventions) — ALWAYS

Before single or quorum review, always read the project's documentation and distill its conventions, patterns and architectural decisions into **house rules**, even when documentation is not a chosen concern.

Read what the repo actually has (don't assume locations):
- `README*`, `CONTRIBUTING*`, `CONTEXT.md`, `ARCHITECTURE*`, `docs/**` and any wiki/handbook checked into the repo.
- **ADRs** — `docs/adr/**`, `docs/decisions/**`, `adr/**` (Architectural Decision Records capture *why* a pattern is mandated; a diff that violates an accepted ADR is a finding).
- Coding guidelines & enforced style — `CODING_GUIDELINES*`, `STYLEGUIDE*`, `.editorconfig`, linter/analyzer config (`.eslintrc*`, `ruff.toml`, `*.ruleset`, `Directory.Build.props`), and `CLAUDE.md`/`AGENTS.md`/`REVIEW.md` if present, including any `Review skip` entries for the skip list (REFERENCE, § Brief templates).
- Infer the **architectural style** from layout and dependencies (DDD / hexagonal / clean / MVC / n-tier / vertical-slice) and the naming/layering it implies.

Attach a short **house-rules brief** to every reviewer: documented patterns, architectural style, layering/dependency direction, naming, error handling and applicable ADRs. Flag deviations as findings. State when the repo has no documentation.

## Step 5 — Run the review (fresh, adversarial grilling)

Spawn via the **Agent tool** — never review from the calling context. Each reviewer applies the **grilling stance** above and judges the diff against the **Step-4 house rules**.
- **Single:** one fresh reviewer; brief = the whole diff + full-file context + the Step-3 ripple set + the Step-4 house rules; stance = find correctness bugs, risks, omissions, **and deviations from the documented conventions/architecture**, assume guilty until proven innocent.
- **Quorum:** one fresh subagent **per chosen concern, in parallel (one message)**, each with a sharp objective / output / tools / boundaries brief (templates in REFERENCE). The **documentation/conventions concern is on by default** (see auto-pick in REFERENCE) — it owns the Step-4 house rules: it checks the diff for conformance to the project's ADRs, coding guidelines, and architectural style, *and* gets `WebSearch` + `WebFetch` to apply **[fact-check](../fact-check/SKILL.md)** on doc/API/version claims against ≥2 authoritative sources, handing back deep-linked evidence. Budget low (per orchestrate): one worker per concern, do not over-spawn.

Each agent returns the **standard finding payload** (location `path:line` · scope · kind · description · expected contract · severity emoji · suggested fix · **verification**) defined in REFERENCE.

**Every finding must be verified before it is reported — no unverified claims.** A finding raised "from reading" is a hypothesis, not a finding. The claim's type fixes which method below grounds it — it is not a menu to pick from, and **the agent must state which method it used in enough detail that the user can replicate it in one step** (per [fact-check](../fact-check/SKILL.md)):
- **Runnable snippet** — for anything executable (logic bug, off-by-one, regex, boundary, encoding, null/overflow, async/ordering, perf claim): write a minimal self-contained snippet (or failing test) that exercises the issue, run it, and report the snippet verbatim plus its actual output, so the user reproduces by copy-paste.
- **In-repo proof** — for an invariant/ripple break that no run could settle: cite the exact `path:line` of the caller/dependent that relies on the broken contract, with the relevant lines quoted (and the `grep`/command that found it).
- **Authoritative source** — for a doc/API/version/standards claim: a working deep link to the spec/docs section (≥2 for consequential claims), quoting the relevant text.

An executable claim — what the code does at runtime — is grounded only by running it and showing the real output, never by an in-repo citation or a source link in its place; if it was not run it is withheld from the findings rather than downgraded to ❓, and is listed under **Not run** with the reason and the command that would settle it. A genuinely ungroundable non-executable claim still downgrades to ❓ uncertain, with plain notice that it is unverified and why. A finding is a chain of claims: split it before choosing a method, and report the atoms grounded rather than withholding the whole finding for the one atom that could not be.

## Step 6 — Consolidate into the findings table

The lead merges agent outputs into **one table** (templates + severity legend in REFERENCE):
- **Dedupe:** same location + same issue raised by multiple agents → **one row**, with each flagging agent's emoji in its column.
- Assign finding **IDs** (`F1`, `F2`, …), fill per-agent severity emoji, compute **Votes** (flagged / total agents — quorum only), and set a **Consensus** severity.
- **Carry each finding's verification through:** the table gets a `Verified` column naming the method; the copy-paste-ready artifact (snippet+output, in-repo proof, or deep link) is reproduced verbatim below the table, keyed by finding ID. An executable finding whose agent returned no usable artifact is withheld from the table and moved to a **Not run** list, one line each naming the claim, why it wasn't run, and the command that would settle it; a non-executable finding with no usable artifact downgrades to ❓ instead.
- **Apply the bar** (REFERENCE, § The bar) to every verified finding, after verification: fill the `Scope` column from the payload's `scope` and `kind`; a finding is 🔥 or ⚠️ only when `scope` is `diff` and `kind` is merge-relevant, whatever any agent's emoji, 🔥 against ⚠️ by kind and artifact as the legend states; a `behaviour` finding with no cited `expected` contract is ❓; a mechanical finding on a changed line that fails prong 2 is ⛏️ and fixed in the PR; any other `style` finding on a changed line is ⛏️, counted only; everything else verified true becomes 📦 Carried. Re-run every `in-repo` and `source` artifact behind a 🔥/⚠️ before it is offered. Group the Carried rows by defect shape and draft one class ticket per shape; draft the summary thread with the size line when it applies. A Carried `data` finding is drafted at blocker priority and named first in the report.
- Order by consensus severity: 🔥, ⚠️, 📦, ⛏️, then ❓.
- **Write each 🔥/⚠️ comment body** to the four-part template (REFERENCE, § Comment body) now, so what the user approves in Step 7 is what gets posted.

## Step 7 — Offer to post (ALWAYS prompt; NEVER auto-post)

> **Driven by `go-go-go`:** its whatever-mode already covers the post-or-not decision, so skip this
> step's ask and post **every** 🔥/⚠️ finding on a diff line (fixed or not) inline via the mechanics below
> — one thread first, confirm it landed, then the rest — then the summary thread, with the off-diff
> blockers in it and the Carried tickets filed.
> On a re-review, 🔥 only (REFERENCE, § Re-review).

> **Under a standing posting policy** — a `manager` mandate (`post=`, `tickets=`), a `CLAUDE.md` that
> names who answers this step, or a lifecycle or patrol that dispatched this review (`sdlc-old-fashioned`
> with its dial on autonomous, `nights-watch`): the three questions go to that principal instead of the
> human. An attended `sdlc-old-fashioned` run still asks the human.
> Post the findings it selects, by the same mechanics.

This step runs after **every** review — single adversarial or quorum alike, when invoked standalone. The moment the table is presented, the orchestrator must:

1. **Detect the active PR** for the reviewed branch and name it in the prompt so the user knows exactly where comments would land:
   - **GitHub** → `gh pr view --json number,url,title -q '.number, .url'` (or `gh pr list --head <branch>`).
   - **Azure DevOps** → resolve via **[AZURE-DEVOPS.md](AZURE-DEVOPS.md)**.
   - If no PR exists for the branch, say so and stop after the table (offer to open one only if asked).
2. **Ask three things explicitly:** (a) *do you want to post comments to PR #N (`<url>`)?*, (b) *which finding IDs?* — offer only the 🔥/⚠️ rows whose line is in the PR diff (e.g. `F1,F3`, `all blockers`, `none`), and on a re-review only the 🔥 rows; off-diff 🔥/⚠️ rows go in the summary thread (REFERENCE, § The bar); 📦 rows are never offered inline, and ⛏️ rows only when the user names them, the first five per round and none on a re-review, and (c) *post the summary thread and file the Carried class tickets?* Default is **post nothing and file nothing** until the user answers. A Carried `data` finding is named first in the report whatever the answer; its ticket is filed with the others on yes.
3. Post **only** the selected subset. Post **one** thread first, confirm it landed (numeric `id` in the response), then the rest; file the tickets, then the summary thread that links them. Each inline comment is the four-part body drafted in Step 6 (REFERENCE, § Comment body). A ⛏️ the user named anyway opens with the nit marker (REFERENCE, § The nit marker) above all of it.

- **GitHub** → inline review comments via `gh api` (path + line + body).
- **Azure DevOps** → delegate to **[AZURE-DEVOPS.md](AZURE-DEVOPS.md)** (its thread/encoding workarounds).

Mechanics for both hosts are in **[REFERENCE.md](REFERENCE.md)**. If there is no PR, or the user declines, stop after the table.
