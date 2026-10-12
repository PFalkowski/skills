---
name: recurring-improvement
description: 'Apply collected skill feedback and run due maintenance; use for tune-ups or "do the rounds".'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# recurring-improvement

Conduct recurring maintenance through owning skills: **A, reflect/evolve every run; B, dispatch due processes**. Every change is a reviewable PR; never auto-merge. This skill schedules, delegates, and records rather than doing process legwork.

## Step 0 — Right-size & locate state

For single fixes/features, route to `go-go-go`/`neat` instead.

Discover the existing backlog first; its `config.root` is authoritative. Default durable schedule: `docs/recurring-backlog.md`, seeded from [TEMPLATE.recurring-backlog.md](TEMPLATE.recurring-backlog.md). Each row records task, proposed CRON interval, last-run, status, and process folder. For one release, also inspect retired roots in [agent-state.md](../docs/agent-state.md): use an existing retired backlog, mention it in the report, and write its next update to the default path.

Each `docs/<process>/` has a RUNBOOK (scope/contract) and newest-first INDEX with stable finding IDs/states (`open`/`accepted`/`wontfix`/`fixed`/`regressed`), per [REFERENCE.md](REFERENCE.md). Adopt existing folders and runbooks; never overwrite. Run reports belong under the state root, not tracked docs.

## Step 1 — Reflect & evolve (Half A)

The default `skill-evolution` process writes `docs/skill-evolution/` records and runs regardless of interval.

1. Window: since last run, or 30 days on first run.
2. Read REFERENCE's signal sources/routing table. Gather feedback memory, lessons/ADRs/postmortems/reflections, and git/PR/revert/review history plus TODO/FIXME/HACK within the window.
3. Identify recurring corrections, underperforming skills, and missing reusable processes.
4. Route skill behavior gaps to `evolve-skill`, missing processes to `write-a-skill` plus a backlog row, project-bound lessons to project memory, and one-off work to `prompt-backlog`.
5. Record stable finding IDs and open a skills-repo PR. Local memory writes need no PR.

## Step 2 — Dispatch what's due (Half B)

1. Parse `<root>/recurring-backlog.md`; due means elapsed interval, never run, or last run over 30 days ago.
2. Delegate due processes to owning skills, one PR per process. Wrap autonomous work in `walk-the-dog` to vet every side effect. If an owner is unavailable, work manually to the same standard and disclose it.

| Process | Owner |
|---|---|
| test-coverage | `tdd` + `go-go-go` / `nightshift` |
| code-quality | `improve-codebase-architecture` / `restomod` |
| fix-warnings | `go-go-go` |
| security-audit | Repo's `security-audit` |

3. Write scratch reports at `~/.agent-state/<repo-slug>/recurring-improvement/runs/<process>/<TODAY>/report.md`. Update process INDEX with new/closed/regressed ID movements; its headline must carry every still-open ID because INDEX and PR are durable. Update backlog last-run/status.
4. Nothing due: report a no-op. Repeating Half B before intervals elapse changes nothing.

## Step 3 — Report

State window, Half-A findings/routes and skills PR, due processes and their PRs, and deferrals.

## Discipline

- No auto-merge. Public-skill pushes require explicit confirmation per `evolve-skill`; protected/default branches require human go.
- Follow each RUNBOOK's calibrated scope; do not invent work beyond the repo's stage.
- Read proposed CRON intervals but never register cron jobs. Run manually or via one user-wired master invocation.

## Init (first run in a repo)

Create the default backlog from its template; scaffold only missing folders from [TEMPLATE.process/](TEMPLATE.process). Commit scaffolding without behavior changes, then run Step 1.

## Related

`evolve-skill`, `write-a-skill`, `prompt-backlog`, `neat`, `go-go-go`, `walk-the-dog`, and `postmortem` supply process execution and feedback.
