---
name: compare-prompts
description: Benchmark a skill before and after a rewrite, or any two prompts, with paired evals and verdicts.
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Compare prompts

Compare any two prompts or skills, A and B; neither needs to be a Git revision.
Determine whether B improves the intended outcome, regresses, or is practically
equivalent. Return **INCONCLUSIVE** when evidence cannot decide; identical sample
scores are not proof of equivalence. Keep local inference as the default.

## Establish the experiment

1. Identify the task, target population, two instruction sources and relevant
   references, model, harness, tools and resource budget. Reuse the project's eval
   infrastructure when it already fits. The bundled runner handles single-turn text;
   tool-using skills need an isolated agent harness and verified end states.
   Test the model that runs the skill in production; if a stand-in is used, name it
   in the report and limit the claim to that model.
2. Before either run, freeze a primary outcome, practical difference margin, quality
   floor, critical regression gates, independent sampling units, trial count and
   stopping rule. Read [METHOD.md](METHOD.md) for the decision contract and sources.
   Ask only for consequential missing requirements; do not invent what “better” means.
3. Separate development cases from a held-out test suite. Sample representative tasks
   independently of the variants; add rare costly cases as explicit gates. Group
   related examples by source/task family. Never tune against the final test results
   and then report that same set as unseen evidence. For a rewrite or compaction of
   a skill, also read METHOD.md § Rewrites and compactions before writing cases.

## Grade what matters

Use deterministic outcome checks where possible: parsed data, executable tests,
artifacts and verified tool effects. Check process constraints separately. A model's
claim that it performed an action is not evidence the action occurred.

Validate graders on known good, bad and valid alternative outputs before testing.
When the skill guides production work, such as writing code, the test task is the
real task: the agent produces the artifact and checks grade it. Multiple choice
measures recognition, not production; use it only as a smoke test, never to decide.

Run a no-instruction or deliberately weakened control on the same frozen suite. This
gate blocks: if A does not beat the control by more than the margin, the suite cannot
see the skill, and the verdict is **INCONCLUSIVE**. Both arms at full marks without
a failing control is a ceiling, not evidence of no regression.

For subjective outputs, read [JUDGING.md](JUDGING.md): calibrated blind comparisons,
order reversal and disagreement handling are required before decisive use.

## Run and decide

Read [RUNNING.md](RUNNING.md) for the self-contained local runner, experiment schema,
trusted Python grader contract and external-harness record format. Pin source bytes,
model digest, engine/template, decoding, tool/environment state, graders and fixtures.
Pair A/B on each input and seed, counterbalance execution order and reset state.
Measure output repeatability separately from quality; repeats are not independent tasks.
Before the full run, run two development cases on both arms and read the raw outputs
for truncation, an output budget spent on thinking, and parse failures.

Keep raw requests, outputs, grades, errors and usage outside the worktree under
`~/.agent-state/<repo-slug>/compare-prompts/`. Infrastructure errors, missing results,
truncation or pin drift invalidate the run; never retry only losing answers or silently
exclude failures. For an invalid run, fix the cause and use a fresh complete run.

The scorer returns **IMPROVEMENT**, **REGRESSION**, **NO_MEANINGFUL_CHANGE**,
**INCONCLUSIVE** or **INVALID**. Introduced or shared critical failures block promotion.
Other decisive verdicts require the predeclared assumptions and confidence interval to
support them. Report shared failures and the absolute quality floor even when the
variants agree. Token or latency savings do not override quality gates.

Deliver the verdict, exact comparison scope/pins, paired effect and interval, sample
and repeat counts, critical regressions, shared failures, reproducibility and cost,
plus paths to the frozen experiment and evidence. State what was not measured.
