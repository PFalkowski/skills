# NuGet Library Refresh Rollout

Tracking document for applying the `refresh-nuget-repo` skill across all PFalkowski NuGet libraries.
Owner: **piotrfalkowski.fm@gmail.com**

---

## Agent handover protocol

**Starting a session:**
1. Read this file — find the first repo with `Not Started` or `In Progress` status.
2. Clone/pull that repo locally.
3. Run `gh repo view <owner>/<repo>` to confirm current state.
4. Invoke the `refresh-nuget-repo` skill (Phase 0 → 8, respecting all gates).
5. After the PR is opened (or session ends naturally), update this table: set status, add PR link and notes.
6. Commit + push this file on branch `feat/multi-repo-refresh-rollout` in the skills repo.

**Rules:**
- One repo per session is fine — quality over speed.
- Do NOT merge this branch until the rollout is complete.
- If you discover a skill gap (missing recipe, wrong instruction), fix it on a sub-branch and open a PR to the skill.
- Never put secrets or personal tokens in any skill file.

---

## Repos and status

| # | NuGet Package(s) | GitHub Repo | NuGet Ver | Priority | Status | PR / Notes |
|---|-----------------|-------------|-----------|----------|--------|-----------|
| 1 | LoggerLite | [LoggerLite](https://github.com/PFalkowski/LoggerLite) | 5.0.0 | — | ✅ Done | Refreshed Jun 2026; source reconstructed from DLL, CI/CD/Sonar wired |
| 2 | Extensions.Standard | [Extensions.Standard](https://github.com/PFalkowski/Extensions.Standard) | 12.0.0 | — | ✅ Done | Refreshed Jun 2026; DeepCopy added, CI/CD/Sonar wired |
| 3 | StandardInterfaces | [StandardInterfaces](https://github.com/PFalkowski/StandardInterfaces) | 3.1.0 | 1 | Not Started | |
| 4 | ProgressReporting | [ProgressReporting](https://github.com/PFalkowski/ProgressReporting) | 2.2.0 | 2 | Not Started | |
| 5 | TextFormatting | [TextFormatting](https://github.com/PFalkowski/TextFormatting) | 2.0.0 | 3 | Not Started | |
| 6 | StrongRandom | [StrongRandom](https://github.com/PFalkowski/StrongRandom) | 2.0.0 | 4 | Not Started | |
| 7 | MiniDiagnostics | [MiniDiagnostics](https://github.com/PFalkowski/MiniDiagnostics) | 1.0.0 | 5 | Not Started | |
| 8 | Services.IO | [Services.IO](https://github.com/PFalkowski/Services.IO) | 1.0.0 | 6 | Not Started | |
| 9 | OnTheFlyStats | [OnTheFlyStats](https://github.com/PFalkowski/OnTheFlyStats) | 7.0.0 | 7 | Not Started | |
| 10 | Sequence | [Sequences](https://github.com/PFalkowski/Sequences) | 4.1.1 | 8 | Not Started | NuGet package id="Sequence", repo="Sequences" |
| 11 | ExceptionHandlingStrategies | [ErrorHandling](https://github.com/PFalkowski/ErrorHandling) | 2.0.0 | 9 | Not Started | NuGet package id="ExceptionHandlingStrategies", repo="ErrorHandling" |
| 12 | ConsoleUserInteractionHelper | [ConsoleUserInteractionHelper](https://github.com/PFalkowski/ConsoleUserInteractionHelper) | 4.0.0 | 10 | Not Started | |
| 13 | Extensions.Serialization | [Extensions.Serialization](https://github.com/PFalkowski/Extensions.Serialization) | 3.3.0 | 11 | Not Started | |
| 14 | Extensions.Serialization.Csv | [Extensions.Serialization.Csv](https://github.com/PFalkowski/Extensions.Serialization.Csv) | 2.1.0 | 12 | Not Started | |
| 15 | Extensions.Serialization.Xml | [Extensions.Serialization.Xml](https://github.com/PFalkowski/Extensions.Serialization.Xml) | 1.0.0 | 13 | Not Started | |
| 16 | SimpleML.GeneticAlgorithm | [SimpleML](https://github.com/PFalkowski/SimpleML) | 4.0.0 | 14 | Not Started | NuGet package id="SimpleML.GeneticAlgorithm", repo="SimpleML" |
| 17 | Stocks.Data.Infrastructure, Stocks.Data.Ef, Stocks.Data.Model, Stocks.Data.Ado | [StocksData](https://github.com/PFalkowski/StocksData) | varies | 15 | Not Started | Multi-package repo; do all 4 packages in one pass |
| 18 | Stocks.Data.Services | [Stocks.Data.Services](https://github.com/PFalkowski/Stocks.Data.Services) | 2.0.0 | 16 | Not Started | ⚠️ Repo URL from NuGet; verify repo exists (`gh repo view`) before starting |
| 19 | LoggerLite.EventLog | [LoggerLite.EventLog](https://github.com/PFalkowski/LoggerLite.EventLog) | 1.0.0 | 17 | Not Started | Depends on LoggerLite — do after #1 is settled |
| 20 | AzurePostgresFlexibleAutoSleep | [AzurePostgresFlexibleAutoSleep](https://github.com/PFalkowski/AzurePostgresFlexibleAutoSleep) | 0.3.0 | 18 | Not Started | Azure Function / infra tool — skill may need adaptation |
| 21 | Diagnostics.Sizeof | ❌ No GitHub repo | 1.0.1 | 19 | Blocked | projectUrl points to codeproject.com — source not on GitHub; skip or create repo first |

---

## Priority rationale

- **1–8 (simple utility libs):** Smallest surface area, fewest dependencies; validate the process quickly.
- **9–15 (moderate libs):** Richer APIs, serialization family; do after process is proven.
- **16–19 (complex / multi-package):** StocksData is a monorepo with multiple NuGet outputs; SimpleML has ML deps; do last.
- **Blocked:** Diagnostics.Sizeof has no GitHub source; handle separately.

---

## Per-repo backlog template

Each session should capture Phase 1 findings here (or in a linked GitHub issue):

```
### <Repo name>

**Phase 1 findings** (filed: YYYY-MM-DD)

P0 repo state:
- 

Correctness bugs:
- 

Breaking API / naming bugs:
- 

Robustness / edge cases:
- 

Maintenance / modernization:
- 

Priority wins:
- 

**Plan:** (phases to execute, major version bump? Y/N, breaking fixes needed?)
```

---

## Skill improvement log

Document learnings here that warrant a skill update:

| Date | Learning | Skill change needed |
|------|----------|---------------------|
| | | |
