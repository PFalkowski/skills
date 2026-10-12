---
name: postmortem
description: 'Write a structured LESSONS-LEARNED.md postmortem after a non-trivial production failure.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# postmortem

After a nontrivial production failure or a review exposing a latent bug class, document evidence, prevention, and regression coverage.

## Procedure

1. **Reconstruct from evidence** (conversation, git, App Insights, etc.): precise symptoms/logs/metrics, first occurrence/detection/fix timeline, and a numbered mechanical root-cause chain ending in an observable, fixable code/config/data invariant. Verify the proximate cause; a real bug alone does not prove causation (see project `diagnostic-certainty` memory). Explain honestly why tests missed it.
2. **Summarize the fix** in one paragraph: change, enforced invariant, why it removes the cause, PR/commit link.
3. **Write concise reusable rules:** concrete checks, stripped of incident-specific details. Usually 2–4; more than 6 warrants compression. Missing tests belong in the tests explanation, not a vague rule.
4. **Verify the fix is committed and pushed** using `git log --oneline -5` and `git status`. If uncommitted, remind the user and do not add the entry yet. Fix and entry belong in the same or adjacent commits on one branch.
5. **Update `LESSONS-LEARNED.md`** as below.
6. **Anchor each rule in regression coverage.** Name existing tests, write missing testable coverage now, or file a `regression-gap` issue if it merits a separate PR. Prefer integration tests for cross-layer/storage/serialization incidents; mocks often miss boundary behavior.
7. **Update memory only for changed standing assumptions:** deployment checks, runbook gotchas/references, or unresolved status now resolved. Do not create a memory event log; `LESSONS-LEARNED.md` is canonical.

## Log structure

Above the index, instruct readers to match `Class` to the work and load only relevant entries, never the whole log. Add this note on creation or first touch if absent.

Keep a newest-first index with one linked row per entry: `Date · Title · Class`. Update it with the entry. Class means root-cause family (e.g. silent failure, store divergence, unbounded read), not component; reuse existing names.

Entries are newest-first, separated by `---`. Use the incident date, not today's date when different. Include the cause chain even for simple incidents and retain the reconstructed timeline.

```markdown
## YYYY-MM-DD — <component + symptom>

**Symptom.** …

**Root cause chain.**
1. …
2. …

**Fix.** …

**Why tests didn't catch it.** …

**Rule.**
- …

---
```

**On the third instance of a class, compact it in the same edit:** one class entry stating the shared invariant once, plus dated one-line instances retaining distinguishing APIs/config/boundaries. Do not append repeats or leave the index stale.

## Output

Report the entry title, tests added/existing or gap issue, fix SHA/push status, and memory changes or “no change needed”.
