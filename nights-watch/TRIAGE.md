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

Triage assigns not just a tier but a process; the watcher writes it into the ranger's brief — except at `opus`, where the process *is not* a brief but a dispatch (see below).

| Tier | Implementation discipline | Dispatched as | Review gate |
|---|---|---|---|
| `haiku` | **TDD Red → Green → Refactor** — same discipline, cheaper model. The red must fail on the asserted behaviour | ranger `agent()` | **code-review-grill**, single reviewer — a **second `agent()` dispatched by the patrol script** against the ranger's PR, *not* by the ranger. It also **verifies the TDD claim**, exemption included |
| `sonnet` | **nightshift** LOOP discipline: TDD Red → Green → Refactor, Q:/A: deferral (unresolvable → return `blocked`, never guess) | ranger `agent()` | as above: a script-dispatched fresh reviewer that never saw the ranger's rationale; findings posted to the PR by the reviewer |
| `opus` | **sdlc-workhorse** — the full by-the-book lifecycle (spec → grilled requirements → design review → TDD → refactor → docs), autonomous by construction | **child `workflow()`**, by the patrol script itself — *not* a ranger | its own fresh-agent grill with refute-tested findings satisfies the gate; it skips the patrol's grill stage rather than paying twice. Add a **code-review-grill** quorum only if the run reports no review ran |

**TDD is the process floor at every tier, and the tier cannot buy it down.** The rubric above picks a *model*, never a discipline: `haiku` means the change is mechanical enough for a cheap model to make, not that it may be made without a test proving it. The old wording — "verified by build/grep/tests as applicable" — put the decision in the ranger's hands with the cheapest model holding it, which is precisely backwards: the tier assigned because a ticket looked trivial was the tier most likely to conclude a test was unnecessary, and a build passing is not evidence that behaviour is correct.

**The one exemption must be earned and is verified.** A change with genuinely no observable behavioural surface — a dep bump with no API delta, doc wording, a licence header sweep — cannot have a meaningful red, and forcing one produces a test written to satisfy a rule rather than to catch a regression. That is worse than no test: everyone downstream reads it as coverage. So the ranger may return `noBehaviouralSurface: true` **with a reason naming what it checked**, and the grill then verifies that claim against the actual diff — a false exemption is a blocking finding. Discretion exists, but it is declared, justified, and reviewed, never assumed from the tier.

**Every ticket gets a premise gate at `opus`, whatever its own tier.** Before any ranger runs, a fresh opus agent establishes what *correct* means for the ticket: every load-bearing claim fact-checked, **only the proven ones held**, the unprovable listed as open questions rather than hedged into the brief. The ranger's tests assert *that* premise. This is floored at opus while the implementation may be haiku, because the failure modes are not symmetric — a cheap ranger writes a wrong line and the grill catches it, while a cheap premise writes a wrong *definition of correct* and every gate afterwards dutifully certifies conformance to it. A green suite asserting the wrong thing is the one defect no downstream reviewer is looking for. Opus tickets skip this stage: `sdlc-workhorse` runs its own premise gates, floored the same way.

**Why `opus` dispatches differently, and why it must.** The other tiers hand a ranger a skill to *follow*. The workhorse is not a runbook — it is a Workflow, and a ranger cannot start one: an `agent()` inside a Workflow has no `Workflow` tool (it holds `Skill`, `Bash`, `Read`/`Write`/`Edit`, `Grep`/`Glob`, `ToolSearch` — verified). A ranger told to "run the sdlc-workhorse skill" would read a SKILL.md whose sole instruction is a tool it cannot call, and would then improvise the lifecycle by hand — the reimplementation the workhorse exists to prevent. So the patrol script calls it directly as a child workflow, which is exactly the one level of nesting `workflow()` permits.

**Why the grill dispatches differently too — same wall, one level up.** The ranger tiers hit the mirror image of the opus problem: an `agent()` inside a Workflow holds no `Agent`/`Task` tool either, so it cannot spawn the fresh reviewer the gate requires any more than it can start a Workflow. A ranger instructed to grill its own diff degrades silently to self-review — which is not the gate, since the value of `code-review-grill` is a reviewer who never saw the author's reasoning, and an author is the last person to catch a flaw in their own. So the grill moves to the layer that *can* spawn: the patrol script runs it as a **second `agent()` after the ranger returns**, handed only the PR URL and the ticket brief. Same fix, same reason, same boundary as the opus row — see [WATCH.md](WATCH.md) § Dispatch and [#46](https://github.com/PFalkowski/skills/issues/46).

**The attended sibling is the wrong skill here.** `sdlc-old-fashioned` holds its gates with a human standing at each one; a patrol has no human standing anywhere. Pointing an unattended ranger at it guarantees the gates are either improvised past or silently dropped. The workhorse is the same lifecycle with the gates held by control flow — the only variant that survives having nobody in the room.

Cross-cutting and unconditional: **fact-check at every critical decision moment** — gate rule 6 at triage, and inside the ranger at each root-cause call, design fork, or the moment an unverified fact is about to enter code: decompose into verifiable sub-claims, prove each with evidence, treat the unprovable as false. And **no PR is labeled `ai-done` un-grilled** — which is now a claim the script can actually keep, and one the watcher checks rather than assumes: `ai-done` requires a grill result, and a missing one is reported, not rounded up to done. And **stealth in the field** (Oath rule 8) at every tier: no code comments beyond the repo's own house rules, nothing in commit messages or PR text that names the Watch, nights-watch, or "ranger" — carried into the brief or `goal` at dispatch, since it doesn't travel on its own.

## Escalation & retry

- Worker fails or produces garbage at its tier → retry **once**, one tier higher, with the failure summary in the prompt.
- Fails again → `ai-blocked` with both attempts summarized. Two strikes; past that, human judgment beats more tokens.
- A worker may also *return early* declaring the ticket under-specified — treat that as a gate failure discovered late: `ai-blocked` + precise comment, no retry.

## Priority within a muster

When the muster exceeds what the budget or the night allows, order by: tracker priority field first, then oldest `ai-ready` first (starvation is a triage bug). Log what was deferred and why — a silent skip reads as "the wall was quiet" when it wasn't.
