# ADR-0004: Exhaustive checks ship as opt-in v2 skills, and a model-checked trace may ground an ordering finding

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Grill phase of one lifecycle run (autonomous; no human question raised). The owner
  asked for the change "as skill v2 so that existing behaviour is preserved".

## Context

Every verification step in this library runs chosen examples or relies on a model's judgement.
Nothing explores every order of events or every input. Before this decision, no file outside
`archive/` mentioned model checking, property-based testing or fuzzing.

`code-review-grill` grounds an executable claim, ordering claims included, only by running it
([SKILL.md](../../code-review-grill/SKILL.md) Step 5; [REFERENCE.md](../../code-review-grill/REFERENCE.md),
the paragraph after the table in "Standard finding payload"). A race that no test can force is therefore withheld under
**Not run** and never becomes a finding. `sdlc-old-fashioned` asks for a test watched to fail, but no
phase asks which promises a change makes or which of them example tests cannot reach.

The owner wants this gap closed without changing what any existing skill, script, workflow, hook,
template or test does.

## Decision

1. **Three new sibling skills, no edits to existing ones.** `formal-check` chooses, builds and
   maintains a check for one promise. `sdlc-old-fashioned-v2` and `code-review-grill-v2` are thin
   overlays: each says to run its base skill in full and lists only its differences. The only
   existing files that change are the registry lines that every new skill needs: the plugin
   manifest, the README skills table and the CI run list.
2. **Nothing selects an overlay unless a user or a manager names it.** The overlays stay
   model-invocable, because a skill with `disable-model-invocation: true` cannot be invoked by
   Claude through the Skill tool ([Claude Code skills docs](https://code.claude.com/docs/en/skills),
   "Control who invokes a skill"), so a manager told to run one could not load it. Their
   descriptions say they are the opt-in v2, used only when named. `formal-check` may also be chosen
   for a request that asks for model checking, property-based testing or every input to be checked,
   which no existing skill serves.
3. **`code-review-grill-v2` adds one grounding method, `model-checked`, for ordering claims.** Every
   action of the reviewer's small model cites the `path:line` it stands for. Where the bad order
   can be forced on the real code, the counterexample is replayed as a deterministic test; that
   test is a run, so the finding is an ordinary `snippet` finding. Where it cannot be forced, the
   finding states why, carries the label "model-checked, not run on the code", and the lead reruns
   the checker before offering it. If the lead cannot rerun it, the claim stays under **Not run**.
   Reviewers are told to apply [fact-check](../../fact-check/SKILL.md), which also withholds an
   ordering claim that was not run, so inside a v2 review the exception covers that rule too.
4. **A model-checked finding is at most Major (⚠️), whatever its kind.** The base bar makes a `data`
   or `rollback` finding a Blocker with any artifact ([REFERENCE.md](../../code-review-grill/REFERENCE.md),
   severity legend). The overlay overrides that for this one method, because the trace was never
   run on the code.
5. **The lifecycle overlay reaches a dynamic-workflow run only through text appended to `goal`.**
   `workflows/sdlc-workhorse.js` is not edited. That text reaches the Spec and Document prompts
   directly. It reaches the later phases only when the spec, the plan's test strategy or a slice's
   acceptance criterion carries it, so the appended text tells each of them to carry it.

## Consequences

- Two lifecycle skills and two review skills sit side by side. A change to a base skill can make
  an overlay's difference wrong, so each overlay copies no line of its base and names phases by
  role, not by number.
- A model-checked finding can describe a race the code does not have, when the model is not true
  to the code. The `path:line` on every action, the lead's rerun and the Major cap bound the cost:
  the author answers such a finding by naming the step that cannot happen in the code.
- The base rule that an executable claim not run is withheld still holds everywhere else, and in
  `code-review-grill` itself.

## Alternatives considered

- **Edit `sdlc-old-fashioned` and `code-review-grill` directly.** Rejected: it changes behaviour for
  every caller, which the owner ruled out.
- **Manual-only overlays.** Rejected: Claude cannot invoke a manual-only skill, so a manager could not
  run one by name.
- **Let a model-checked `data` finding be a Blocker.** Rejected for now: no other un-run executable
  claim can block a merge in this library. The owner can lift the cap by editing the overlay.
- **Add v2 phases to `workflows/sdlc-workhorse.js`.** Rejected: workflow scripts must not change.
