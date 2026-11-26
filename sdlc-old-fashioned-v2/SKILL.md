---
name: sdlc-old-fashioned-v2
description: 'Opt-in v2 of sdlc-old-fashioned, used only when named: classifies promises, adds exhaustive checks.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# sdlc-old-fashioned-v2 — a check for every promise example tests cannot reach

Run [sdlc-old-fashioned](../sdlc-old-fashioned/SKILL.md) in full, every phase, gate and dial included. This overlay adds the five numbered rules in the block below and changes nothing else. Use it only when a person or a manager names it. [ADR-0004](../docs/adr/0004-opt-in-v2-exhaustive-checks.md) records why. [formal-check](../formal-check/SKILL.md) defines promises, CHOOSE, CREATE and the project skill. The base lifecycle wants a test seen to fail, yet no phase asks what the change promises, or which promise no chosen example can reach: a race between two steps, or an input nobody thought to write.

## Who carries the rules

You, whoever conducts the lifecycle, are the only reader of this file. Phase agents never load it. A manager that is given this skill by name (`manager run sdlc-old-fashioned-v2 <task>`) either conducts the lifecycle and so reads this file, or names this skill in the brief of the conductor it dispatches. Each rule names its phase by role ([the lifecycle](../sdlc-old-fashioned/SKILL.md#the-lifecycle--each-phase-has-a-gate-do-not-advance-until-its-met)), and it must reach that phase in something the phase agent receives:

- **Single agent.** You run every phase yourself, so apply each rule when you reach its phase.
- **Fresh process or subagent per phase.** Copy each rule, word for word, into the GATE line of the [brief](../sdlc-old-fashioned/references/handover-protocol.md#1-write-the-brief) for every phase it names, beside the base gate. Rule 2's instructions to the slicer go into the slice brief, and rule 4 into the RED and GREEN briefs.
- **Dynamic workflow.** Append the block, unchanged, to `goal` in the [dispatch](../sdlc-old-fashioned/references/workflow-mode.md#dispatch). The script has no v2 phases and is not changed, so the phase agents themselves carry the rules from there, as "In a workflow run" says.

## The block

This is the only fenced block in this file. [Its test](../tests/workflows/sdlc-old-fashioned-v2.test.js) reads it, checks its shape and runs the workflow script with it. The header line only tells the Spec agent to copy; every instruction sits inside a numbered rule, because a Spec agent that copies the rules literally drops anything outside them. Rule 5's clean-tree test is step 7 of [CREATE](../formal-check/CREATE.md#7-what-the-project-skill-records), and its command lives there only.

```text
v2 lifecycle (skill sdlc-old-fashioned-v2). Spec: copy each numbered rule below, word for word, into the spec's scope and into its success criteria. The phases between Spec and Document see the spec, not this text.
1. Spec names each promise of this change: a guarantee whose break harms a user, with that harm in one plain sentence (skill formal-check defines promises, CHOOSE, CREATE and the project skill).
2. Plan classifies each promise with formal-check CHOOSE and names its check, or says why example tests reach it; where the design removes the bad order, it names the atomic operation, and RED is an ordinary failing test. The plan's testStrategy names each classified promise's check, command and broken variant, restates rule 4, and tells the slicer that each slice covering a classified promise names its check and broken variant in its acceptanceCriterion; for a model check, that acceptanceCriterion also quotes, word for word, the invariant definition and the config line that names it.
3. Plan review attacks that classification.
4. RED for a classified promise is its check, built per formal-check CREATE, watched to fail on a known-bad version of the covered code: today's code for a fix, a variant without the promise's guard for new code. GREEN is the same check passing, and the able-to-fail demonstration is repeated on the finished code. For a model check, the test GREEN must not touch is the property, the invariant definition and the config line that names it, which stay byte-identical from RED to GREEN; GREEN rewrites the model's actions from the code, each citing path:line. If the checker cannot run, RED is not met and is reported as not run; no example test stands in.
5. Document writes or updates the project skill per formal-check CREATE after the last code change, reruns each check at HEAD, and records that HEAD as the sync commit only when CREATE's clean-tree test passes; otherwise it records Sync commit: none and why.
```

## In a workflow run

How far the block travels, as its test pins by running the real script with stub agents: the script puts `goal` into the baseline, spec and document prompts. The Spec agent is the designed carrier: the rules it copies travel in the spec to the grill, the plan and the plan review. The grill's acceptance criteria replace the spec's success criteria and reach the plan and the slicer, so the slicer sees the rules only when the grill returns no acceptanceCriteria field at all, and the plan's testStrategy is what tells it. The plan's testStrategy reaches the plan review, the slicer, RED, GREEN and document; the refuters of the plan's claims see only the start of the plan, so do not count on it reaching them. A slice's acceptanceCriterion reaches RED, the RED check and the review. The baseline's pitfalls are a second path from `goal` to later phases; this overlay neither designs for that path nor relies on it.

After the run, check the returned `spec` and `plan` before you [read the rest of the report](../sdlc-old-fashioned/references/workflow-mode.md#reading-the-report). The spec's scope must hold the five rules word for word, and the plan's testStrategy must name a check for each classified promise. When either is missing, v2 did not take: report the run as a base run that missed v2, never as a v2 result. This is your own check; nothing in the script makes it, and a Spec agent may paraphrase or drop a rule.

Rule 5 is then yours as well. The script's Document agent ran before you commit, before the review and before the fixes that follow it, so what it recorded is provisional. After the last code change, rerun each check at HEAD and write the sync commit yourself, as rule 5 says.

## Unchanged

The review phase stays code-review-grill. To use [code-review-grill-v2](../code-review-grill-v2/SKILL.md), the caller names it, and you name it in the review brief; in a workflow run the script's own review always uses code-review-grill, because its prompt names it, so name code-review-grill-v2 for the review you run after the script returns. State, gates, dials and merge rules are the base skill's.
