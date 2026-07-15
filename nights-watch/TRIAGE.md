# Triage — the gate and the rubric

The watcher triages from the **ticket text only** (title, body, comments, linked context). It does not open the codebase — that's the worker's job. If readiness can't be judged from the ticket, the ticket isn't ready.

## Readiness gate (all must pass)

A ticket labeled `ai-ready` still fails the gate when any of these is missing. Failing → comment the *specific* missing pieces (so a human can fix the ticket, not guess), label `ai-blocked`, move on.

1. **Observable outcome.** The ticket states what "done" looks like in a checkable way (a behavior, a test, an error that stops happening). "Improve X" without a criterion fails.
2. **Self-contained.** Everything needed is in the ticket or the repo it points at. No "as discussed in the meeting", no dependency on an unmerged decision, no missing credentials/fixtures.
3. **No human fork in the road.** The work doesn't hinge on a choice only a human can make (public API shape, schema migration, product tradeoff, anything irreversible or outward-facing). Reversible implementation choices are fine — workers decide and note them in the PR.
4. **Scope fits one PR.** A ranger works one branch to one PR. An epic-sized ticket fails with a suggestion to split.
5. **Repo is reachable.** The ticket names (or the tracker implies) a repo the Watch can clone/push to. Verify access before claiming, not after.

## Tier rubric — lowest sufficient model

Default is **`sonnet`**. Move off it only when the ticket clearly matches another row. When torn between two tiers, take the lower — a failed attempt escalates one tier on retry (once), which is cheaper than over-provisioning every ticket.

| Tier | Ticket smells like | Examples |
|---|---|---|
| `haiku` | Mechanical, unambiguous, verifiable by grep/build alone | typo/rename sweeps, dep version bump, config tweak, adding a lint rule, doc wording fixes |
| `sonnet` (default) | Normal engineering: localized change + tests | bug fix with repro, small feature in an existing pattern, new test coverage, refactor within a module |
| `opus` | Cross-cutting reasoning where a wrong design costs more than the tier premium | multi-module refactor with tricky invariants, concurrency/correctness bugs without a repro, performance work needing hypothesis-driven diagnosis |

Effort follows tier: `low` for haiku-class chores, default for sonnet, `high` only for the opus row. Record the assigned tier in the claim comment — it makes the Watch's economics auditable.

## Escalation & retry

- Worker fails or produces garbage at its tier → retry **once**, one tier higher, with the failure summary in the prompt.
- Fails again → `ai-blocked` with both attempts summarized. Two strikes; past that, human judgment beats more tokens.
- A worker may also *return early* declaring the ticket under-specified — treat that as a gate failure discovered late: `ai-blocked` + precise comment, no retry.

## Priority within a muster

When the muster exceeds what the budget or the night allows, order by: tracker priority field first, then oldest `ai-ready` first (starvation is a triage bug). Log what was deferred and why — a silent skip reads as "the wall was quiet" when it wasn't.
