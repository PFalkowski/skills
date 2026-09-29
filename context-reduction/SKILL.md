---
name: context-reduction
description: 'Prune bloated docs, comments and agent artifacts; retain truth in code, tests and git.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# context-reduction

Reduce prose by making code, tests, and git history authoritative, then deleting redundant records. Do not add knowledge graphs, summaries, or archives that duplicate truth. A pointer index is allowed: one line per record (name, status, location), updated with that record; never repeat its contents.

| Truth | Owner |
|---|---|
| Behavior | Code |
| Behavior guarantee | Test: ordinary > architecture > characterization pin |
| Past behavior and reasons for change | Git history, not inline changelogs |
| Value | One config file |
| Decision | One ADR; link, do not summarize |
| Campaign working notes | Untracked scratch; retain only ledger row and PR |

## The runbook

Stages gate each other: prose may be a behavior's sole record, so deletion needs mechanically verified preparation.

### Stage 0 — Measure and write the bar down

1. Build/reuse an executable counter (e.g. comment/code lines per file and total); record baseline. Validate scope filters against known files, especially production versus tests.
2. Add the survival bar to repo agent instructions: retain only prose whose removal risks a costly wrong decision code cannot prevent: traps, cited external constraints invisible in code, non-obvious why in 1–2 sentences, destructive-operation safety warnings. Comments may not assert behavior of code they do not sit on; test important claims instead.

### Stage 1 — Drift scan (additive, agent-safe)

3. Fan out scanners over disjoint scopes: ADRs, guidance, agent docs, project comments, external skills/config. Every prompt must require **reading the actual file/code before opening a finding**. Cap findings; prioritize actionable commands, paths, and config over trivia.
4. Classify claims: **drifted** (fix at source or delete), **duplicated** (one owner; copies become pointers or disappear), **sole record** (true, not derivable from code or recorded elsewhere), or keep-worthy under the bar.
5. History is not drift: never rewrite dated records/ADRs. Mark superseded ADRs with `Superseded by …`.
6. Assign stable IDs and states (`open`/`accepted`/`wontfix`/`fixed`). Reports are untracked scratch; retain a one-row INDEX ledger entry carrying open IDs and the PR description.

### Stage 2 — Sole-record blind spots (the load-bearing stage)

7. For each sole record, read candidate test assertions; coverage does not prove the claim. Record behavior, code location, exact asserting test or `NONE`, and testability without credentials.
8. Verify both presence and absence of tests; do not assume either.

### Stage 3 — Dispositions

9. Record exactly one disposition per sole record: `already-tested`, `ordinary-test` (preferred), `architecture-test` (structural), `characterization-pin` (current behavior is the spec), or `neither`. Record the reason, including rejected test options.
10. Run a mechanical gate that fails on any blank disposition cell.

### Stage 4 — Delete (human-gated, delete-first)

11. Require an explicit, recorded human go (issue comment or equivalent), even if the gate passes.
12. Default to deletion; compress to 1–2 lines only for unambiguous allowlist content. Shortened restatements still drift.
13. Keep edits comment/prose-only, with zero code-line changes. Keep/delete whole XML/doc blocks. Replace pinned traps with a one-line test pointer. Name protected `keep` rows in each sweep prompt. For each reviewable slice, worst files first: build, test, rerun counter.
14. Delete, never archive; correct drift at its source, not with adjacent disclaimers.
15. Session artifacts nobody reads back (logs, handoffs, briefs, notes) skip Stages 2–3 and are deleted first; they record process rather than behavior.

### Stage 5 — Keep it down

16. Put the counter in CI with hard thresholds.
17. Register recurring drift scans with an interval; feed lessons into responsible skills.
18. Hold campaign artifacts to the same bar: ledger rows and PR descriptions survive; per-run reports stay gitignored scratch.
