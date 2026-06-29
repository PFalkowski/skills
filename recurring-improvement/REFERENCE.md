# recurring-improvement — reference

Details kept out of `SKILL.md`: the `docs/<process>/` convention, the signal
sources for Half A, the finding→route table, and the default backlog rows.

## The `docs/<process>/` house style

Every recurring task drives one process folder. `<process>` is a placeholder —
substitute the task's name (`security-audit`, `test-coverage`, …). The shape:

```
docs/<process>/
  RUNBOOK.md            # the process contract: goal, SCOPE CALIBRATION, the cycle, output format
  INDEX.md              # run-history ledger — chronological table, newest first
  runs/YYYY-MM-DD/
    report.md           # what this run found/dispatched; references the previous run
    <artifacts>         # optional supporting files
```

- **INDEX.md is the ledger.** One row per run: `Date (→ run) │ New │ Closed │ Regressed │ Headline`. The `Closed`/`Regressed`/`New` columns track movement vs the previous run.
- **Stable IDs across runs.** Findings/items get persistent IDs (e.g. `RI-0001`, or a process-specific prefix like `SEC-0001`) with a **state**: `open` / `accepted` (out of scope for now, kept for a future run) / `wontfix` / `fixed` / `regressed`. A later run *promotes/closes* existing IDs rather than re-finding them. This is what makes "what were we missing since last run" tractable: an `open` item stays open until addressed.
- **RUNBOOK carries scope calibration.** State what's IN and OUT of scope for the repo's current stage, so a run doesn't manufacture work (a pre-production repo defers production-grade hardening; a library defers app concerns). The skill reads this before doing the process.
- **Machine-readable config as data.** Thresholds, path globs, and commands a process needs live as data the user edits (a fenced block in the RUNBOOK or a sibling JSON), not hardcoded in prose.

## `docs/recurring-backlog.md` — the schedule

The master index the skill reads for due-detection. One row per recurring task:
`Process │ Description │ Interval (proposed CRON) │ Last run │ Status │ Records (→ docs/<process>/INDEX.md)`.

- **Interval** is a human cadence + the equivalent CRON expression as documentation (e.g. `weekly · 0 0 * * 1`). The skill computes due-ness from interval + last-run; it does **not** register cron jobs.
- **Due** = `now − last_run ≥ interval`, or never-run, or `> 30 days`.
- **Status** ∈ `active` / `paused` / `retired`. Paused rows are skipped; retired rows are kept for history.
- Adding a new recurring process = add a row + scaffold its `docs/<process>/`.

## Half A — signal sources (since last run / 30d)

Scan for what the toolbox has been missing. Prefer breadth; cite specifics.

| Source | What to look for |
|---|---|
| Project memory (`~/.claude/projects/<repo>/memory/`) | `feedback_*` entries and the index — corrections, "always do X", repeated guidance |
| Lessons-learned / `LESSONS-LEARNED.md` / postmortems | recurring root causes, forward-looking rules not yet codified |
| ADRs (`docs/adr/`) & reflections | decisions/process notes that imply a missing or stale skill |
| README / contributing / house docs | conventions a skill should enforce but doesn't |
| Git history (commits, merged PRs) | recurring fix themes, reverts, repeated review comments, churn hot-spots |
| Code markers | `TODO` / `FIXME` / `HACK` clusters that signal a systemic gap |

## Half A — finding → route

| Finding | Route to | Output |
|---|---|---|
| A skill behaved wrong / keeps missing X (generalizable) | `evolve-skill` | edit to the skill's canonical source → PR |
| A distinct reusable process has no skill | `write-a-skill` | new skill + a new backlog row → PR |
| Lesson true only for *this* repo | project memory | memory file (local, not PR'd) |
| Concrete one-off work to do later | `prompt-backlog` | a ready-to-run backlog item |
| Config / MCP / permission issue | `update-config` | settings change (not a skill) |

Keep edits **minimal and generalized** — capture the rule, strip private
specifics (absolute paths, single-repo issue numbers, sensitive names), keep
the *why*. Don't let the meta-work bury the run.

## Default backlog rows (seeded on init)

| Process | Description | Proposed interval | Owner skill(s) |
|---|---|---|---|
| `skill-evolution` | Half A — reflect on feedback/lessons/git since last run; evolve the toolbox | monthly · `0 0 1 * *` (but **runs every invocation**) | `evolve-skill`, `write-a-skill` |
| `test-coverage` | analyze coverage on the critical path; add the missing tests | weekly · `0 0 * * 1` | `tdd`, `go-go-go` / `nightshift` |
| `code-quality` | read the repo's docs/standards; refactor to adhere | monthly · `0 0 1 * *` | `improve-codebase-architecture` / `restomod` |
| `fix-warnings` | drive build/lint/analyzer warnings to zero | weekly · `0 0 * * 1` | `go-go-go` |
| `security-audit` | run the security audit; track findings as stable IDs | monthly · `0 0 1 * *` | the repo's `security-audit` skill |

Intervals are proposals; the user edits them. "Critical path" for `test-coverage`
is defined by a path-glob list in that process's RUNBOOK (default: entrypoints,
auth, payments/billing, and any data/seed pipeline).

## Degradation

If an owning skill isn't installed, the process is still run **by hand to the
same standard**, and the run report says so. The skill never silently skips a
due process; it either runs it (delegated or by hand) or records why it was
deferred (with a stable ID kept `open`).
