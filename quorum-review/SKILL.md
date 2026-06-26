---
name: quorum-review
description: 'Adversarial code review of a branch/PR diff by a FRESH agent that never authored the code — run as a single adversarial reviewer or a quorum of concern-based subagents (security / architecture / code-quality / documentation / performance / tests). Always asks single-vs-quorum first; if quorum and the user does not name concerns, the orchestrator picks them from the diff. The documentation agent gets web access and fact-checks claims against authoritative sources. Runbook: resolve the base branch (default = repo default) -> merge-base 3-dot diff -> trace ripple effects across the codebase -> spawn the reviewer(s) -> consolidate into one findings table (id, description, per-agent severity emoji, votes) -> NEVER auto-post; present the table and ask which findings to post as inline PR threads (GitHub via gh, Azure DevOps via azure-devops-pr-review). Use for "quorum review", "review this branch/PR adversarially", "red-team this diff", or /quorum-review. Distinct from the built-in single-pass /code-review.'
---

# quorum-review — adversarial code review by a fresh agent

**The reviewer is never the author.** The calling session is too close to the diff (it wrote it, or watched it being written) to judge it honestly — it will rationalise. So the calling session acts only as **orchestrator + synthesizer**: it preps the diff, spawns *fresh* `Agent` subagents to do all the critiquing, and consolidates. Every finding originates from an agent that started cold and was told to assume the code is wrong until proven right.

This is heavier and more skeptical than the built-in single-pass `/code-review`; reach for it when a change is load-bearing or you want concern-by-concern coverage with a paper trail.

## Step 0 — Pick the stance (ALWAYS ask)

Ask the user: **single adversarial agent** or **quorum**?
- **Single** — one fresh reviewer over the whole diff. Fast, cheap, good default for small/contained changes.
- **Quorum** — one fresh subagent per concern, run in parallel; this is the orchestrator-workers pattern (see **[orchestrate](../orchestrate/SKILL.md)** for briefs and effort budgets). If the user names concerns, use exactly those; if not, the orchestrator picks the relevant subset from the diff. Concern menu + the auto-pick heuristic live in **[REFERENCE.md](REFERENCE.md)**.

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

## Step 3 — Trace ripple effects

For every changed public symbol, signature, invariant, or config key, grep callers and dependents **repo-wide**. An invariant dropped in one file may be silently relied on in another. The lead gathers this dependent set once and hands it to the reviewer(s) so they judge the change in context, not in isolation.

## Step 4 — Run the review (fresh, adversarial)

Spawn via the **Agent tool** — never review from the calling context.
- **Single:** one fresh reviewer; brief = the whole diff + full-file context + the Step-3 ripple set; stance = find correctness bugs, risks, and omissions, assume guilty until proven innocent.
- **Quorum:** one fresh subagent **per chosen concern, in parallel (one message)**, each with a sharp objective / output / tools / boundaries brief (templates in REFERENCE). The **documentation agent gets `WebSearch` + `WebFetch`** and applies **[fact-check](../fact-check/SKILL.md)** — verify doc/API/version claims against ≥2 authoritative sources, hand back deep-linked evidence. Budget low (per orchestrate): one worker per concern, do not over-spawn.

Each agent returns the **standard finding payload** (location `path:line` · description · severity emoji · suggested fix · evidence) defined in REFERENCE.

## Step 5 — Consolidate into the findings table

The lead merges agent outputs into **one table** (templates + severity legend in REFERENCE):
- **Dedupe:** same location + same issue raised by multiple agents → **one row**, with each flagging agent's emoji in its column.
- Assign finding **IDs** (`F1`, `F2`, …), fill per-agent severity emoji, compute **Votes** (flagged / total agents — quorum only), and set a **Consensus** severity.
- Order by consensus severity, blockers first.

## Step 6 — Offer to post (NEVER auto-post)

Present the table, then **ask the user which findings (if any) to post** as inline PR threads. Post **only** the selected subset. Post **one** thread first, confirm it landed, then the rest.
- **GitHub** → inline review comments via `gh api` (path + line + body).
- **Azure DevOps** → delegate to **[azure-devops-pr-review](../azure-devops-pr-review/SKILL.md)** (its thread/encoding workarounds).

Mechanics for both hosts are in **[REFERENCE.md](REFERENCE.md)**. If there is no PR, or the user declines, stop after the table.
