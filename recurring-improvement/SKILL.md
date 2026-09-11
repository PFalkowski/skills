---
name: recurring-improvement
description: 'Evolves skills from feedback, then runs due recurring maintenance. Triggers: tune-up, improvement run, kaizen, do the rounds, what have we missed since last time. Distinct from neat (feature SDLC), go-go-go (ship now), prompt-backlog (one-off deferred work), evolve-skill (single feedback→edit, done here in bulk).'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# recurring-improvement

A conductor for a repo's **recurring** maintenance and self-improvement. It does **no legwork itself**: it sequences recurring *processes*, holds the schedule, and keeps the paper trail.

Two things happen on a run:

- **A — Reflect & evolve (always).** Read what's accumulated since last run and turn it into durable toolbox improvements (evolve a skill, write a new one, or record a project lesson).
- **B — Dispatch what's due.** Run the scheduled maintenance processes whose interval has elapsed.

Both halves obey one rule: **every change is a reviewable PR; nothing is auto-merged.** The human reviews.

## Step 0 — Right-size & locate state

This is for *periodic* upkeep, not a single fix (that's `go-go-go`) or one feature (that's `neat`). If the user wants one task done now, stop and point them there.

State lives under `docs/` in the standard house style:

- **`docs/recurring-backlog.md`** — the master schedule: one row per recurring task with description, **interval (proposed CRON)**, last-run, status, and a link to that task's process folder. This file is the source of truth for due-detection. Seed it from [`TEMPLATE.recurring-backlog.md`](TEMPLATE.recurring-backlog.md) on first run.
- **`docs/<process>/`** — one folder *per recurring task* (`<process>` is a placeholder — it's whatever process that row drives, e.g. `security-audit`, `test-coverage`). Each follows the convention in [`REFERENCE.md`](REFERENCE.md): `RUNBOOK.md` (the process contract incl. scope calibration) + `INDEX.md` (run-history ledger, newest first) + **stable IDs** with **states** (`open`/`accepted`/`wontfix`/`fixed`/`regressed`). Per-run reports are state, not records, and live under the house state root ([agent-state.md](../docs/agent-state.md)).

The schedule is a deliverable — a human reads it to see what is due without knowing a run happened — so it is committed, and `docs/recurring-backlog.md` is its home. **Discover it first**, because a repo may already keep it elsewhere: whichever backlog exists owns the root, and its `config.root` line is authoritative. For one release, also read this skill's retired roots, listed in [agent-state.md](../docs/agent-state.md) § Retired paths — if one of those is what exists, use it and say so in the run report, then write the next update to `docs/recurring-backlog.md`.

**Adopt, don't recreate.** If a process folder already exists (e.g. a repo already runs `docs/security-audit/`), point the backlog row at it and use its existing RUNBOOK/INDEX — never overwrite it.

## Step 1 — Reflect & evolve (Half A)

This is itself a process row (default: `skill-evolution`) and writes its own `docs/skill-evolution/` records, but it **runs every time** regardless of interval.

1. **Window.** `now − last_run`, or the last **30 days** if never run.
2. **Gather signals in the window** (see [REFERENCE.md](REFERENCE.md) for the full source list): project memory (esp. `feedback_*` entries), lessons-learned / ADRs / postmortems / reflections, and git history (commits, merged PRs, reverts, repeated review comments, `TODO/FIXME/HACK`).
3. **Distill "what we were missing"** — gaps between that feedback and the current skills: a skill that repeatedly underperformed, a manual correction that recurred, a process no skill captures.
4. **Route each finding** (table in [REFERENCE.md](REFERENCE.md)):
   - skill-behaviour gap → drive **`evolve-skill`**
   - missing reusable process → drive **`write-a-skill`** (and add a backlog row for it)
   - project-bound lesson → **project memory** (not a public skill)
   - one-off actionable work → **`prompt-backlog`**
5. **Record** the findings as stable IDs in `docs/skill-evolution/` and open the skill-repo PR. Memory writes are local, not PR'd.

## Step 2 — Dispatch what's due (Half B)

1. Parse `<root>/recurring-backlog.md` (discovery order above). A row is **due** when `now − last_run ≥ interval` (or never run / >30 days).
2. For each due process, **delegate to its owning skill** and produce **one PR per process**. Wrap autonomous execution in **`walk-the-dog`** so every side-effecting action is vetted. Suggested owners (degrade gracefully — if a skill isn't installed, do the work by hand to the same standard and say so):
   | Process | Owner skill(s) |
   |---|---|
   | `test-coverage` | `tdd` + `go-go-go` / `nightshift` |
   | `code-quality` | `improve-codebase-architecture` / `restomod` |
   | `fix-warnings` | `go-go-go` |
   | `security-audit` | the repo's `security-audit` skill |
3. Each process writes its run report as **working scratch** under the state root (`~/.agent-state/<repo-slug>/recurring-improvement/runs/<process>/<TODAY>/report.md`), then updates its `INDEX.md` (new/closed/regressed, ID movements — the row's headline must carry every still-`open` ID, since the row and the PR description are the only durable records) and the master `<root>/recurring-backlog.md` (last-run, status).
4. **Nothing due → no-op report.** Idempotent: re-running before anything elapses changes nothing.

## Step 3 — Report

Summarise: window used, Half-A findings + their routes (with the skills-repo PR link), which processes were due, and the per-process PR links. List anything deferred.

## Discipline

- **Every change is a PR; never auto-merge.** Push public-skill changes only with explicit confirmation (see `evolve-skill`). Protected/default branches need a human go.
- **Scope calibration is real.** Each process's RUNBOOK states what's in/out of scope so runs don't over-engineer (e.g. a pre-production repo defers SOC2-grade hardening). Don't invent work the repo's stage doesn't warrant.
- **Conduct, don't solo.** Use the owning skill for each process; this skill only schedules, dispatches, and keeps the ledger.
- **The schedule is a proposal.** Intervals in the backlog are suggested CRON cadences the user edits; the skill reads them but does **not** register cron jobs (run it manually, or wire one master cron that invokes `/recurring-improvement`).

## Init (first run in a repo)

1. Create `docs/recurring-backlog.md` from [`TEMPLATE.recurring-backlog.md`](TEMPLATE.recurring-backlog.md) with the default rows.
2. For each row without an existing folder, scaffold `docs/<process>/` from [`TEMPLATE.process/`](TEMPLATE.process) (`RUNBOOK.md` + `INDEX.md`). Leave existing process folders untouched.
3. Commit the scaffold (no behaviour change yet), then proceed with Step 1.

## Related

`evolve-skill` (single feedback→skill edit — this drives it in bulk) · `write-a-skill` (new skill) · `prompt-backlog` (one-off deferred work) · `neat` (one feature's SDLC) · `go-go-go` (ship one thing) · `walk-the-dog` (delegation safety gate) · `postmortem` (incident lessons that feed Half A).
