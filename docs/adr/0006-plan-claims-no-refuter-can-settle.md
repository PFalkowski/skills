# ADR-0006: A plan claim no refuter can settle is decomposed, answered once, then blocked or tested

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** repo owner, on issue #275 (decision recorded 2026-11-18)

## Context

At the plan gate of `workflows/sdlc-workhorse.js`, three refuters judge each load-bearing plan claim. A claim counts as proven only when a majority confirm it. A claim with no majority either way (votes of "unverifiable", or a split) was treated like one refuted with evidence. The planner had no bounded way to answer it, and the blocker did not say what the verifiers found. The rule "unprovable = false" stays: such a claim must never enter the `VERIFIED PREMISE`.

## Decision

A claim that no refuter can settle goes through four steps, in this order.

1. **Decompose.** The script dispatches a `decompose` agent that builds an atom tree with the `atomic-decomposition` skill, and a separate `split-check` agent that must return "confirmed" before any atom is checked. At most 3 atoms are checked, one after another, in the skill's order. An atom under a branch that an earlier atom already decided is skipped and the trail names the deciding atom. A refuted atom refutes its branch; an unsettled atom is kept and reported, never dropped. A malformed tree (a root or parent `split` other than "all" or "any" included), a rejected split, a null reply or a throw leaves the claim unsettled with the reason in its trail. Each claim text is decomposed once per run. Atom refuters get an even-handed opening, as the `atomic-decomposition` skill asks: answer "refuted" or "confirmed" only on a run with its output, a quoted source or two independent sources, otherwise "unverifiable". They skip the memo of earlier verdicts, which holds only default-to-refuted ones.
2. **One answer round.** One `answer` agent, at the plan tier, sees every claim still unsettled and, per claim, answers it with evidence, withdraws it with a reason, or marks it "settled by test X". A claim text listed twice is answered once. An answer that lacks the field its action needs (evidence, reason or test) is no answer. Answers are re-checked by three fresh refuters with the even-handed opening, skipping the memo. A rewording is checked, and reported to the builders, in its new wording beside the claim it replaces. A re-check that does not confirm leaves the claim unsettled or refuted. There is exactly one round per run: the branch that runs it always ends the plan loop.
3. **Evidence in the blocker.** Each claim left unsettled or refuted becomes its own blocker, `plan claim <status>: <claim>`, whose detail holds every vote, every atom and the answer. This holds on a reopens-requirements stop and on an unapproved last round too.
4. **Settled by test, last.** A claim marked "settled by test X" gets an id (T1, T2, ...), in claim order. The answer prompt and the red step both say the test must fail before the change exists. The slicer names the slice that writes it, that slice is built first, and its red step names the test. After the build the report shows `green` or `not green`. A planned test no slice carries goes to `mergeBlockedBy`.

The fallbacks run only on an approved review with no must-fix finding, and either on the last round or when no claim was refuted at its first check. Otherwise the plan is redesigned anyway and the fallbacks would be wasted. On an earlier round, a claim refuted by its atoms sends the plan back with the atom evidence, with no answer round.

Cost bounds: at most 3 atom checks per claim (each with three refuters), plus one decomposer, one split checker, and one answer agent with three re-check refuters per answered claim. Every agent sets its model from `tiers`: the decomposer and split checker at the verify tier, the answerer at the plan tier.

## Rules that keep the gate honest

- A cached decomposition result is reused for the same claim text. A cached "refuted" always applies. A cached "confirmed" or "unsettled" applies only when this round's first check was also unverified, so it never overrides a fresh majority.
- Only a claim that stayed unsettled may be marked "settled by test". A claim refuted with evidence never takes that route.
- A claim confirmed by its atoms, confirmed after the answer round, withdrawn or marked for a test goes to `planClaims` and the builders' note, in claim order, never to a `VERIFIED PREMISE` block.
- A claim refuted at its first check on an approved last round is still deferred, as before. A gate that did not run still blocks `mergeReady`.

## Alternatives rejected

- **Apply the cache to rejected claims only.** A claim re-proved by fresh refuters can be held and never meet the cache, so a run builds on a claim its atoms refuted.
- **Apply cached results unconditionally.** A cached "confirmed" would override a fresh majority that refuted the claim.
- **Run the answer round as a new plan round.** That is a full redesign, review and extraction while the memo still replays the old verdict.
- **Let the decomposer settle its own atoms, or let the answer agent edit the saved plan.** The first has the split's author grade it. The second changes nothing the builders read, because they read the plan agent's returned JSON.
- **Run the fallbacks on every plan round.** It spends agents on a plan that is being redesigned anyway.
- **Tell the red-check agent the claim for the carrying slice.** It changes the RED gate, which stays unchanged for every slice.
- **Catch a spent token budget in the fallbacks.** Every later `agent()` call throws, including the retrospective's, so the extra code could not return anything.

## Consequences and residuals

- The decomposer and split checker share a tier and may share a blind spot.
- First checks at every gate keep the default-to-refuted opening, so a claim nobody can check is refuted there before any fallback sees it. Issue #361 decides whether that changes.
- The script does not compare the test the red step wrote with the test the claim named.
- A claim about behaviour that already exists can be marked for a test that passes at once; the prompts forbid it, but nothing checks it (issue #353 covers the RED gate).
