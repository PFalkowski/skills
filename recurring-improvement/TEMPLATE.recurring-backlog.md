# Recurring backlog — process schedule

> Master index of this repo's recurring improvement processes, driven by the
> `recurring-improvement` skill (`/recurring-improvement`). Each row drives a
> `docs/<process>/` that follows the standard **RUNBOOK + INDEX + runs/**
> convention. **Due-detection:** a process runs when `now − last_run ≥ interval`
> (or never run / > 30 days). Intervals are *proposed* CRON cadences you edit;
> the skill reads them but does **not** register cron jobs — run it manually,
> or wire one master cron that invokes `/recurring-improvement`.
>
> `config.root: docs` — change to `.recurring-improvement` for repos without a `docs/` dir.

| Process | Description | Interval (proposed CRON) | Last run | Status | Records |
|---|---|---|---|---|---|
| skill-evolution | Reflect on feedback (memory), lessons/ADRs/postmortems and git history since last run; evolve skills via evolve-skill / write-a-skill. **Runs every invocation.** | monthly · `0 0 1 * *` | — | active | [docs/skill-evolution/INDEX.md](skill-evolution/INDEX.md) |
| test-coverage | Analyze coverage on the critical path and add the missing tests. | weekly · `0 0 * * 1` | — | active | [docs/test-coverage/INDEX.md](test-coverage/INDEX.md) |
| code-quality | Read the repo's docs/standards and refactor to adhere. | monthly · `0 0 1 * *` | — | active | [docs/code-quality/INDEX.md](code-quality/INDEX.md) |
| fix-warnings | Drive build / lint / analyzer warnings to zero. | weekly · `0 0 * * 1` | — | active | [docs/fix-warnings/INDEX.md](fix-warnings/INDEX.md) |
| security-audit | Run the security audit; track findings as stable IDs across runs. | monthly · `0 0 1 * *` | — | active | [docs/security-audit/INDEX.md](security-audit/INDEX.md) |

<!--
Add a row to register a new recurring process, then scaffold docs/<process>/
from the skill's TEMPLATE.process/. Status ∈ active | paused | retired.
If a process folder already exists in this repo, point the row at it and
DO NOT overwrite its RUNBOOK/INDEX.
-->
