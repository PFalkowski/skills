---
name: code-review-grill
description: 'Adversarial "grilling" code review of a branch/PR diff by a FRESH agent that never authored the code — run as a single adversarial reviewer or a quorum of concern-based subagents (security / architecture / code-quality / documentation / performance / tests). Each reviewer grills the diff hunk-by-hunk (what must be true for this to be correct? what input breaks it? what caller relied on the old behavior?), resolving each thread before moving on. ALWAYS reads the repo''s own documentation first — README, ADRs (docs/adr), coding guidelines, patterns/practices — and distills the house rules so the diff is judged against the project''s documented architecture (a DDD repo and an n-tier repo demand different critiques); the documentation/conventions concern fires almost always. Always asks single-vs-quorum first; if quorum and the user does not name concerns, the orchestrator picks them from the diff. Every finding must be verified (runnable snippet + output, in-repo proof, or authoritative deep link) before it is reported — speculation is not a finding. The documentation agent gets web access and fact-checks claims against authoritative sources. Runbook: resolve the base branch (default = repo default) -> merge-base 3-dot diff -> trace ripple effects across the codebase -> spawn the reviewer(s) -> consolidate into one findings table (id, description, per-agent severity emoji, votes, verification) -> NEVER auto-post; detect the active PR, then ask which findings to post as inline PR threads (GitHub via gh, Azure DevOps via azure-devops-pr-review). Use for "grill this diff/PR", "adversarial code review", "quorum review", "review this branch/PR adversarially", "red-team this diff", or /code-review-grill. Distinct from the built-in single-pass /code-review.'
---

# code-review-grill — adversarial "grilling" code review by a fresh agent

**The reviewer is never the author.** The calling session is too close to the diff (it wrote it, or watched it being written) to judge it honestly — it will rationalise. So the calling session acts only as **orchestrator + synthesizer**: it preps the diff, spawns *fresh* `Agent` subagents to do all the critiquing, and consolidates. Every finding originates from an agent that started cold and was told to assume the code is wrong until proven right.

Where Matt Pocock's [grill-me](https://github.com/mattpocock/skills) interrogates *the user* about a plan one question at a time, this skill turns the same relentless interrogation onto *the diff*: the reviewer grills each change to a verified conclusion instead of skimming. This is heavier and more skeptical than the built-in single-pass `/code-review`; reach for it when a change is load-bearing or you want concern-by-concern coverage with a paper trail.

## The grilling stance (how every reviewer works)

Adapted from grill-me's interrogation discipline, applied to code:
- **One thread at a time.** Take a hunk, interrogate it to a conclusion, *then* move on — don't fan out half-questions across the whole diff. Walk each branch of the "is this correct?" tree, resolving dependencies between decisions one-by-one.
- **Interrogate, don't admire.** For each change ask: *what must be true for this to be correct? what input breaks it? what caller/test relied on the old behavior? what did the author assume?*
- **Answer by exploring, never by speculating.** grill-me's rule "if the codebase can answer it, explore instead of asking" becomes: if a doubt can be settled by running a snippet, grepping the repo, or checking the project's docs, do that — that *is* the [verification](#step-5--run-the-review-fresh-adversarial-grilling) every finding must carry. An un-run hypothesis is not a finding.
- **Carry a recommended answer.** Like grill-me proposing an answer per question, every finding ships a concrete suggested fix.

## Step 0 — Pick the stance (ALWAYS ask)

Ask the user: **single adversarial agent** or **quorum**?
- **Single** — one fresh reviewer over the whole diff. Fast, cheap, good default for small/contained changes.
- **Quorum** — one fresh subagent per concern, run in parallel; this is the orchestrator-workers pattern (see **[orchestrate](../orchestrate/SKILL.md)** for briefs and effort budgets). If the user names concerns, use exactly those; if not, the orchestrator picks the relevant subset from the diff. Concern menu + the auto-pick heuristic live in **[REFERENCE.md](REFERENCE.md)**.

> **Azure DevOps PRs:** delegate the whole resolve → diff → post pipeline to
> [azure-devops-pr-review](../azure-devops-pr-review/SKILL.md) (its steps 1–5) from the start, not
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
Read the changed files at **full context**, not just the hunks — a change is only correct in the surrounding code (mirrors `azure-devops-pr-review` step 3).

**Consider materializing a worktree at PR-head** (`git worktree add`) to do that reading. It's just a checkout — no restore/build — so its cost scales with repo size, not solution complexity; don't confuse it with building the solution. It turns full-context reads and ripple-tracing into plain Read/Grep/Glob calls on real paths instead of repeated `git show <ref>:<path>`, gives real 1-indexed line numbers for free (useful later when posting inline comments), and — unlike switching the current checkout — doesn't disturb whatever the user has checked out if the PR branch isn't already local. Skip it for a small diff where a couple of `git show`s are just as fast; for a large or heavy repo (monorepo, submodules, huge history) where even a checkout isn't obviously cheap, ask the user before creating one rather than deciding silently.

## Step 3 — Trace ripple effects

For every changed public symbol, signature, invariant, or config key, grep callers and dependents **repo-wide** (`git grep`, on the worktree if you made one, or on the ref directly if not). An invariant dropped in one file may be silently relied on in another. The lead gathers this dependent set once and hands it to the reviewer(s) so they judge the change in context, not in isolation.

**Building/testing locally is the reviewer's call, not a default step.** If CI already gates the PR, check its status first (`gh pr checks`, or for Azure DevOps the PR's status checks / build info) and cite that rather than re-deriving it — a full local build+test pass mostly duplicates what CI already verified, and rarely surfaces the kind of defects this skill exists to find (those tend to come from reading code and reasoning about it, not from compiling it). But if there's no CI configured, or its status isn't visible from where you're standing, a local build/test run is a reasonable — often the only — way to establish that baseline; use judgment. Either way, an actual build or test run is also the natural route to a **runnable-snippet verification artifact** for a specific finding (a minimal repro, or one targeted test proving one hypothesis).

## Step 4 — Capture the house rules (docs, ADRs, conventions) — ALWAYS

**Code is only "correct" relative to the architecture it lives in.** The same construct that is right in a multitier/n-tier repo is wrong in a DDD repo (e.g. a controller reaching into the database, an anemic entity, a leaked persistence type across a bounded-context boundary). So before any reviewer judges the diff, the orchestrator **always** reads the project's own documentation and distills the **house rules** — the conventions, patterns, and architectural decisions the code is expected to honour. This runs for **single and quorum alike**, even when documentation is not a chosen concern.

Read what the repo actually has (don't assume locations):
- `README*`, `CONTRIBUTING*`, `CONTEXT.md`, `ARCHITECTURE*`, `docs/**` and any wiki/handbook checked into the repo.
- **ADRs** — `docs/adr/**`, `docs/decisions/**`, `adr/**` (Architectural Decision Records capture *why* a pattern is mandated; a diff that violates an accepted ADR is a finding).
- Coding guidelines & enforced style — `CODING_GUIDELINES*`, `STYLEGUIDE*`, `.editorconfig`, linter/analyzer config (`.eslintrc*`, `ruff.toml`, `*.ruleset`, `Directory.Build.props`), and `CLAUDE.md`/`AGENTS.md` if present.
- Infer the **architectural style** from layout and dependencies (DDD / hexagonal / clean / MVC / n-tier / vertical-slice) and the naming/layering it implies.

Distill this into a short **house-rules brief** (the documented patterns, the architectural style, the layering/dependency direction, naming and error-handling conventions, and any ADR a changed file falls under) and attach it to **every** reviewer. Reviewers judge the diff against these rules and flag deviations as findings; if the repo documents *nothing*, say so — that absence is itself worth noting.

## Step 5 — Run the review (fresh, adversarial grilling)

Spawn via the **Agent tool** — never review from the calling context. Each reviewer applies the **grilling stance** above and judges the diff against the **Step-4 house rules**.
- **Single:** one fresh reviewer; brief = the whole diff + full-file context + the Step-3 ripple set + the Step-4 house rules; stance = find correctness bugs, risks, omissions, **and deviations from the documented conventions/architecture**, assume guilty until proven innocent.
- **Quorum:** one fresh subagent **per chosen concern, in parallel (one message)**, each with a sharp objective / output / tools / boundaries brief (templates in REFERENCE). The **documentation/conventions concern is on by default** (see auto-pick in REFERENCE) — it owns the Step-4 house rules: it checks the diff for conformance to the project's ADRs, coding guidelines, and architectural style, *and* gets `WebSearch` + `WebFetch` to apply **[fact-check](../fact-check/SKILL.md)** on doc/API/version claims against ≥2 authoritative sources, handing back deep-linked evidence. Budget low (per orchestrate): one worker per concern, do not over-spawn.

Each agent returns the **standard finding payload** (location `path:line` · description · severity emoji · suggested fix · **verification**) defined in REFERENCE.

**Every finding must be verified before it is reported — no unverified claims.** A finding raised "from reading" is a hypothesis, not a finding. Before an agent emits a finding it must ground it by the strongest method the problem allows, and **state which method it used in enough detail that the user can replicate it in one step** (per [fact-check](../fact-check/SKILL.md)):
- **Runnable snippet** — for anything executable (logic bug, off-by-one, regex, boundary, encoding, null/overflow, async/ordering, perf claim): write a minimal self-contained snippet (or failing test) that exercises the issue, run it, and report the snippet verbatim plus its actual output, so the user reproduces by copy-paste.
- **In-repo proof** — for invariant/ripple breaks: cite the exact `path:line` of the caller/dependent that relies on the broken contract, with the relevant lines quoted (and the `grep`/command that found it).
- **Authoritative source** — for doc/API/version/standards claims: a working deep link to the spec/docs section (≥2 for consequential claims), quoting the relevant text.

If a finding **cannot** be grounded by any of these, the agent must downgrade it to ❓ uncertain and say plainly that it is unverified and why. Pick the method that fits the problem; always show the work.

## Step 6 — Consolidate into the findings table

The lead merges agent outputs into **one table** (templates + severity legend in REFERENCE):
- **Dedupe:** same location + same issue raised by multiple agents → **one row**, with each flagging agent's emoji in its column.
- Assign finding **IDs** (`F1`, `F2`, …), fill per-agent severity emoji, compute **Votes** (flagged / total agents — quorum only), and set a **Consensus** severity.
- **Carry each finding's verification through:** the table gets a `Verified` column naming the method; the copy-paste-ready artifact (snippet+output, in-repo proof, or deep link) is reproduced verbatim below the table, keyed by finding ID. Drop or downgrade any finding whose agent returned no usable artifact.
- Order by consensus severity, blockers first.

## Step 7 — Offer to post (ALWAYS prompt; NEVER auto-post)

> **Driven by `go-go-go`:** its whatever-mode already covers the post-or-not decision, so skip this
> step's ask and post **every** finding (fixed or not) via the mechanics below — one thread first,
> confirm it landed, then the rest.

This step runs after **every** review — single adversarial or quorum alike, when invoked standalone. The moment the table is presented, the orchestrator must:

1. **Detect the active PR** for the reviewed branch and name it in the prompt so the user knows exactly where comments would land:
   - **GitHub** → `gh pr view --json number,url,title -q '.number, .url'` (or `gh pr list --head <branch>`).
   - **Azure DevOps** → resolve via **[azure-devops-pr-review](../azure-devops-pr-review/SKILL.md)**.
   - If no PR exists for the branch, say so and stop after the table (offer to open one only if asked).
2. **Ask two things explicitly:** (a) *do you want to post comments to PR #N (`<url>`)?* and (b) *which finding IDs?* (e.g. `F1,F3`, `all blockers`, `none`). Default is **post nothing** until the user names IDs.
3. Post **only** the selected subset. Post **one** thread first, confirm it landed (numeric `id` in the response), then the rest. Each comment body includes the finding's severity, ID, description, suggested fix, and its verification artifact.

- **GitHub** → inline review comments via `gh api` (path + line + body).
- **Azure DevOps** → delegate to **[azure-devops-pr-review](../azure-devops-pr-review/SKILL.md)** (its thread/encoding workarounds).

Mechanics for both hosts are in **[REFERENCE.md](REFERENCE.md)**. If there is no PR, or the user declines, stop after the table.
