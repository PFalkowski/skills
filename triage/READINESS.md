# Readiness — is this ticket work an unattended agent should take?

The canonical statement of the bar. `nights-watch` gates on it before dispatch, this skill applies it when
assigning a state role, and a repo's own label doc should reference it rather than restating it.

Two questions, and **both must be yes**. They are genuinely different, and the second is the one that gets
skipped.

## 1. Ready — is it specified well enough?

1. **Falsifiable acceptance.** "Done" is checkable: a behaviour, a test, an error that stops happening. Crucially,
   the ticket must let a **null result count as success** — an open-ended "investigate X" with no way to succeed
   by finding nothing pressures an agent into manufacturing a finding, which is worse than no answer.
   "Improve X" without a criterion fails.
2. **Self-contained.** Everything needed is in the ticket or the repo it points at. No "as discussed in the
   meeting", no dependency on an unmerged decision, no missing fixtures. If the ticket bundles a measurement with
   "then decide where the fix belongs", scope it to the measurement and say so — the decision is a separate item.
3. **No human fork in the road.** The work doesn't hinge on a choice only a person can make: public API shape,
   schema migration, product trade-off, anything irreversible or outward-facing. Reversible implementation
   choices are fine; the worker decides and notes them.
4. **Fits one change.** One branch, one pull request. An epic fails with a suggestion to split.
5. **Reachable environment.** The repo can be cloned and pushed to, and the work needs no vendor API key, no
   production access, and no manual console step. Verify before claiming, not after.
6. **Bounded blast radius.** Nothing destructive or irreversible, no production data mutated, no published result
   changed. If a person would want to approve the action before it happened, it is not agent work.
7. **Load-bearing claims are proven.** Where the ticket rests on a claim — an API behaves like X, version Y
   supports Z, a number copied from a dashboard, "this bug is caused by W" — prove it before acting on it. An
   unprovable claim counts as false. Discovering mid-check that the premise is wrong is the process working.

## 2. Intended — is it wanted right now?

A readiness rubric cannot answer this, which is why it is a separate question rather than an eighth item. Parked,
deferred, superseded, "filed so it isn't lost", awaiting-a-decision, umbrella and discussion tickets are all
**perfectly well specified**. Every one of them passes section 1. Every one of them is wrong to build.

Signals, in rough order of reliability:

- **Labels** — `parked`, `blocked`, `wontfix`, `discussion`, or a priority lane that means "not now".
- **Milestone and assignee** — already owned by a person, or scheduled for later.
- **The prose.** Most often the real signal, and the reason a model reads better here than a query: *"not
  blocking", "filed rather than absorbed", "for the record", "when we get to it", "someone should eventually",
  "spun out so it isn't lost"*.

A repo that wants to withhold well-specified work from agents does it here — by labelling intent, not by
withholding a readiness label. Say so in the repo's label doc, because it changes what a `parked` label *is*: no
longer a note to a future reader, but the mechanism.

## When unsure, the answer is no

The costs are lopsided. A false accept spends a worker, a branch, a review and a person's attention on a change
nobody wanted — and on an *intent* misjudgement, that change may actively contradict a decision already made. A
false reject costs one line in a summary that a person can override.

## Never enact a refusal

Record why a ticket was declined; do not label, close, or comment it into a state on that basis — unless a human
asked about that specific ticket and is waiting for the answer.

Any judgement applied across a whole board will be wrong sometimes. When a refusal is only *reported*, a wrong
call costs a line of text. When it is written to the tracker, it costs someone else the work of finding an
authoritative-looking label and undoing it.
