# <Process> Runbook

> Replace `<Process>` with this recurring task's name. This is the repo-local
> **contract** for the process; the `recurring-improvement` skill drives it.
> Invoked as part of `/recurring-improvement` (or standalone if the process
> has its own skill, e.g. `/security-audit`).

## 1. Goal

What this process is for, in one or two sentences. State the *bar* — what
"good enough" means here — not an abstract ideal.

## 2. Scope calibration

What is **IN** and **OUT** of scope **for this repo at its current stage**, so
runs don't manufacture work. Be explicit; this is the guard against
over-engineering.

**IN scope**
- …

**OUT of scope (until the project's stage changes)**
- … (record out-of-scope items found during recon as `accepted` with a note, still giving them a stable ID so a future run can promote them.)

## 3. Config (data the run reads — edit here, not in code)

```yaml
# e.g. for test-coverage:
critical_paths: []      # path globs the run must cover
commands: { test: auto, lint: auto, build: auto }   # auto = sniff from package.json / *.sln / Makefile
```

## 4. The cycle

1. Read the previous run's `INDEX.md` row and its still-`open` IDs (run reports are
   untracked scratch — the row is the record).
2. Do the work (delegated to the owning skill, or by hand to the same standard).
3. Assign/▲promote stable IDs with states (`open` / `accepted` / `wontfix` / `fixed` / `regressed`).
4. Write `runs/<TODAY>/report.md` — **untracked scratch** (ensure `<root>/*/runs/` is
   gitignored); update `INDEX.md` (New / Closed / Regressed / Headline — the headline
   must carry every still-`open` ID, it is the durable record).
5. Open one PR for the work; put the findings summary in its description. Update
   `<root>/recurring-backlog.md` (last-run, status).

## 5. Output format

The (untracked) `runs/<DATE>/report.md` scratch records: scope of this run,
findings/changes with their stable IDs and states, the PR link, and what was
deferred (and why). What survives the run: the `INDEX.md` row and the PR description.
