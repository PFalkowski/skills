# Triage — the gate and the rubric

The watcher triages from the **ticket text only** (title, body, comments, linked context). It does not open the codebase — that's the worker's job. If readiness can't be judged from the ticket, the ticket isn't ready.

## Readiness gate (all must pass)

A ticket labeled `ai-ready` still fails the gate when any of these is missing. Failing → comment the *specific* missing pieces (so a human can fix the ticket, not guess), label `ai-blocked`, move on.

1. **Observable outcome.** The ticket states what "done" looks like in a checkable way (a behavior, a test, an error that stops happening). "Improve X" without a criterion fails.
2. **Self-contained.** Everything needed is in the ticket or the repo it points at. No "as discussed in the meeting", no dependency on an unmerged decision, no missing credentials/fixtures.
3. **No human fork in the road.** The work doesn't hinge on a choice only a human can make (public API shape, schema migration, product tradeoff, anything irreversible or outward-facing). Reversible implementation choices are fine — workers decide and note them in the PR.
4. **Scope fits one PR.** A ranger works one branch to one PR. An epic-sized ticket fails with a suggestion to split.
5. **Repo is reachable.** The ticket names (or the tracker implies) a repo the Watch can clone/push to. Verify access before claiming, not after.
6. **Load-bearing claims are proven, not assumed.** If the ticket (or the triage verdict itself) rests on a claim — an API behaves like X, version Y supports Z, a number copied from docs, "this bug is caused by W" — run the **fact-check** skill on it (mandatory, not optional): decompose it into smaller verifiable sub-claims and prove each with a runnable experiment + output or independent authoritative sources. A claim that can't be proven counts as false. Refuted or unprovable → `ai-blocked` with the evidence; proven → carry the proof (source links / experiment) into the ranger's brief so it lands in the PR. Finding out mid-check that the premise is wrong is the process working, not a failure.

## Tier rubric — lowest sufficient model

Default is **`sonnet`**. Move off it only when the ticket clearly matches another row. When torn between two tiers, take the lower — a failed attempt escalates one tier on retry (once), which is cheaper than over-provisioning every ticket.

| Tier | Ticket smells like | Examples |
|---|---|---|
| `haiku` | Mechanical, unambiguous, verifiable by grep/build alone | typo/rename sweeps, dep version bump, config tweak, adding a lint rule, doc wording fixes |
| `sonnet` (default) | Normal engineering: localized change + tests | bug fix with repro, small feature in an existing pattern, new test coverage, refactor within a module |
| `opus` | Cross-cutting reasoning where a wrong design costs more than the tier premium | multi-module refactor with tricky invariants, concurrency/correctness bugs without a repro, performance work needing hypothesis-driven diagnosis |

Effort follows tier: `low` for haiku-class chores, default for sonnet, `high` only for the opus row. Record the assigned tier in the claim comment — it makes the Watch's economics auditable.

## Process assignment (which sworn-brother skills the ranger runs)

Triage assigns not just a tier but a process; the watcher writes it into the ranger's brief.

| Tier | Implementation discipline | Review gate |
|---|---|---|
| `haiku` | Direct change, verified by build/grep/tests as applicable | **code-review-grill**, single reviewer |
| `sonnet` | **nightshift** LOOP discipline: TDD Red → Green → Refactor, Q:/A: deferral (unresolvable → return `blocked`, never guess) | **code-review-grill**, single adversarial reviewer; findings posted to the PR |
| `opus` | **sdlc-old-fashioned** — the full by-the-book lifecycle (spec → grilled requirements → design review → TDD → refactor → docs); its built-in adversarial review satisfies the gate | **code-review-grill** quorum if the SDLC run didn't already include an equivalent adversarial pass |

Cross-cutting and unconditional: **fact-check at every critical decision moment** — gate rule 6 at triage, and inside the ranger at each root-cause call, design fork, or the moment an unverified fact is about to enter code: decompose into verifiable sub-claims, prove each with evidence, treat the unprovable as false. And **no PR is labeled `ai-done` un-grilled**.

## Escalation & retry

- Worker fails or produces garbage at its tier → retry **once**, one tier higher, with the failure summary in the prompt.
- Fails again → `ai-blocked` with both attempts summarized. Two strikes; past that, human judgment beats more tokens.
- A worker may also *return early* declaring the ticket under-specified — treat that as a gate failure discovered late: `ai-blocked` + precise comment, no retry.

## Priority within a muster

When the muster exceeds what the budget or the night allows, order by: tracker priority field first, then oldest `ai-ready` first (starvation is a triage bug). Log what was deferred and why — a silent skip reads as "the wall was quiet" when it wasn't.
