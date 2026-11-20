---
name: benchmark-skill
description: Benchmark a skill before and after a rewrite, or any two prompts, with paired evals and verdicts.
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Benchmark skill

Compare any two prompts or skills, A and B; neither needs to be a Git revision.
Determine whether B improves the intended outcome, regresses, or is practically
equivalent. Return **INCONCLUSIVE** when evidence cannot decide; identical sample
scores are not proof of equivalence. Keep local inference as the default.
Whether a skill's description makes it load for the right requests is a separate
question this skill does not answer; use the description loop in Anthropic's
[skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md).

## Establish the experiment

1. Identify the task, target population, two instruction sources and relevant
   references, model, harness, tools and resource budget. Reuse the project's eval
   infrastructure when it already fits. The bundled runner handles single-turn text;
   tool-using skills need an isolated agent harness and verified end states.
   Test the model that runs the skill in production; if a stand-in is used, name it
   in the report and limit the claim to that model.
2. Before either run, freeze a primary outcome, practical difference margin, quality
   floor, critical regression gates, independent sampling units, trial count,
   stopping rule, ceiling rate (above twice the margin) and difficulty ladder. Read
   [METHOD.md](METHOD.md) for the decision contract and sources.
   Ask only for consequential missing requirements; do not invent what “better” means.
3. Separate development cases from a held-out test suite. Sample representative tasks
   independently of the variants; add rare costly cases as explicit gates. Group
   related examples by source/task family. Include cases where the skill should
   change nothing, so a version that over-applies its rules fails. Never tune against
   the final test results and then report that same set as unseen evidence. For a
   rewrite or compaction of a skill, also read METHOD.md § Rewrites and compactions
   before writing cases. For a skill that guides code writing, read JUDGING.md
   § Skills that guide code writing before writing cases.

## Grade what matters

Use deterministic outcome checks where possible: parsed data, executable tests,
artifacts and verified tool effects. Check process constraints separately. A model's
claim that it performed an action is not evidence the action occurred.

Validate graders on known good, bad and valid alternative outputs before testing.
Then read the raw transcripts of several development passes and failures, for each
arm and the control; a grader is not validated until someone has. When the skill
guides production work, such as writing code, the test task is the real task: the
agent produces the artifact and checks grade it. Multiple choice measures
recognition, not production; use it only as a smoke test, never to decide.

The scorer applies four more gates, in the order of METHOD.md § Verdict precedence,
when you give it the evidence in a context file (RUNNING.md § Gate evidence). A gate
without its evidence is listed in the report's `unchecked_gates`; then apply that
gate yourself from § Ceiling and floor effects before you trust the verdict.
- Ceiling: if arm A's success rate on the test clusters reaches the frozen ceiling
  rate, the report says INCONCLUSIVE with `next_step` set, unless an earlier step
  applies. Leave the suite unedited and run the next rung of the frozen ladder on new
  held-out cases. On the last allowed suite the verdict follows steps 6 to 10, with the reason "ceiling" when it
  is **INCONCLUSIVE**.
- Floor effect: if A's rate is at or below the margin, check the graders and answer
  keys first, then step down the same way. On the last allowed suite the verdict is
  **INCONCLUSIVE**, "floor effect" (step 5).
- Earlier loss: if an earlier suite of the ladder showed an observed paired effect
  below the negative margin, the verdict is **INCONCLUSIVE**, "earlier loss"
  (step 6).
- Sensitivity: run a no-instruction or weakened control on the same frozen suite; if
  A does not beat it by more than the margin, the verdict is **INCONCLUSIVE**,
  "skill not visible" (step 7).

For subjective outputs, read [JUDGING.md](JUDGING.md): calibrated blind comparisons,
order reversal and disagreement handling are required before decisive use.

## Run and decide

Read [RUNNING.md](RUNNING.md) for the runner, experiment schema, grader contract,
external-harness format and the two-case smoke run required before the full run.
Pin source bytes, model digest, engine/template, decoding, tool/environment state,
graders and fixtures. Pair A/B on each input and seed, counterbalance execution order
and reset state. Measure output repeatability separately from quality; repeats are
not independent tasks.

Keep raw requests, outputs, grades, errors and usage outside the worktree under
`~/.agent-state/<repo-slug>/benchmark-skill/`. Infrastructure errors, missing results,
truncated, empty or blocked outputs, or pin drift invalidate the run; never retry only
losing answers or silently exclude failures. Fix the cause and make a fresh complete
run. Any change to a case, grader or prompt contract voids every earlier score.

The scorer returns **IMPROVEMENT**, **REGRESSION**, **NO_MEANINGFUL_CHANGE**,
**INCONCLUSIVE** or **INVALID**. Introduced or shared critical failures block promotion.
Other decisive verdicts require the predeclared assumptions and confidence interval to
support them. Report shared failures and the absolute quality floor even when the
variants agree. Token or latency savings do not override quality gates.

Deliver the verdict, exact comparison scope/pins, paired effect and interval, sample
and repeat counts, critical regressions, shared failures, reproducibility and cost,
plus paths to the frozen experiment and evidence. List by ID the cases every arm
passed, the control included (non-discriminating), the cases every arm failed
(suspect the answer key), and the cases only one arm passed. State the number of
suites run, the rung and population the verdict covers, and what was not measured.
