---
name: postmortem
description: 'Write a structured production-incident postmortem: captures symptom, root-cause chain, fix, and forward-looking rules; appends the entry to LESSONS-LEARNED.md (newest at top); checks for regression tests and testing gaps; verifies fix is committed and pushed; updates project memory if the incident changes architecture or process. Invoke after any non-trivial production failure or incident, or when the user says "/postmortem".'
---

# postmortem

Structured incident write-up — prevent recurrence, not just record what happened.

## Trigger
After any non-trivial production failure: wrong output, silent data loss, crash,
mis-deploy, bad migration, OOM, or any incident that "took longer than it should have
to diagnose." Also useful when a code review reveals a class of latent bug.

## Runbook

### 1 — Reconstruct the incident

Pull from the conversation context, git log, App Insights, or wherever the evidence lives.

- **Symptom** — what the user/monitor saw. Be specific: log lines, metric names, values.
- **Timeline** — when it first appeared, when it was noticed, when it was fixed.
- **Root cause chain** — numbered list, each step mechanically causes the next. Stop at "the
  code did the wrong thing because…", not "humans made a mistake." The chain is done when
  the last step is an observable, fixable code/config/data invariant.
- **Why tests didn't catch it** — a short, honest sentence. If a test *should* have existed,
  say so here rather than in the rule.

### 2 — Summarise the fix

One paragraph. What changed, what invariant it enforces, why that eliminates the root cause.
Cross-reference the PR/commit if available.

### 3 — Write forward-looking rules

Each rule answers: "what does a future contributor need to know to not re-lay this trap?"

- **Actionable** — a concrete check, not a vague "be careful."
- **Generalised** — strip the incident-specific details; keep what's reusable.
- **Shortest that's unambiguous.** 2–4 rules is usually right; more than 6 is a smell.

### 4 — Append to LESSONS-LEARNED.md

Format (newest at top, separator `---` between entries):

```markdown
## YYYY-MM-DD — <short title: component + symptom>

**Symptom.** …

**Root cause chain.**
1. …
2. …

**Fix.** …

**Why tests didn't catch it.** …

**Rule.**
- …
- …

---
```

Check that the date header matches the incident date (not today's date if they differ).
Spell out the root cause chain even for simple incidents — the mechanical chain is what
makes a LESSONS-LEARNED entry worth re-reading a year later.

### 5 — Check for regression tests

For each rule, ask: *Is there a test that would catch this if the code regressed?*

- If yes → note it. No further action needed on the test.
- If no and the gap is testable → write the test now, or file an issue with `regression-gap`
  label if it's complex enough to be its own PR. Don't leave a documented incident without
  at least a regression anchor.

Preferred: **integration tests** over unit tests for incidents involving multiple layers
(storage adapters, dual-write, serialization seams) — unit tests with mocks often fail to
surface the real boundary behaviour that caused the incident.

### 6 — Verify the fix is committed and pushed

```
git log --oneline -5
git status
```

If uncommitted: remind the user. Don't create the LESSONS-LEARNED entry for a fix that
isn't in source control yet — the entry and the fix belong in the same commit or adjacent
commits on the same branch.

### 7 — Update project memory (conditional)

Update memory only when the incident **changes a standing assumption** that future sessions
need to act on:

- A new "verify after deploy" checklist item (e.g. "after DualWriteReadFrom=DuckDb flip,
  check SymbolsCountInDb > 0").
- A gotcha that belongs in a runbook referenced by memory.
- A resolved incident whose memory entry said "status: unresolved."

Don't create a new memory file for the incident itself — LESSONS-LEARNED.md is the
canonical incident log; memory is for *standing rules and references*, not event records.

## Output

End with a short summary block:

```
### Postmortem complete
- LESSONS-LEARNED.md: appended "<title>"
- Regression tests: <"added X tests" | "gap filed as issue #N" | "covered by existing: <test name>">
- Fix: committed <sha> / pushed
- Memory: <"updated <file>" | "no change needed">
```

## Anti-patterns

- Don't write rules that say "don't make this specific mistake" — the rule should be
  generalisable to a class of mistakes.
- Don't add a LESSONS-LEARNED entry before the fix is in source control — the two belong
  together.
- Don't conflate "a real bug" with "the proven proximate cause" — verify with hard evidence
  before writing the root cause chain (see `diagnostic-certainty` memory for this project).
- Don't omit the root cause chain for "obvious" incidents — the chain is the part that
  generalises.
