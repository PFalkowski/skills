# Experimental design and decisions

There is no universal “best” prompt benchmark. Choose outcomes that represent the
actual work; a decisive result is conditional on the task distribution, model,
harness, graders and resources tested. The methods below combine established eval
practice with a deliberately conservative decision rule.

## Freeze before looking

Record A/B instruction files and required references, independently authored task
inputs, grader code/rubric, success threshold, critical gates, model/harness pin,
repetitions, test budget and decision margin. Keep prompt optimization on development
cases; use held-out cases only for the final comparison. A new candidate developed
from those failures needs a new holdout. Do not keep sampling until a favorable
confidence interval appears: fix the sample size or preregister a valid sequential
procedure. The bundled scorer uses a fixed sample, not sequential inference.
After a run, any change to a case, answer key, grader or prompt contract voids every
earlier score of every arm, the control included. Rerun all arms as a new run; never
mix scores from before and after the change.

Construct a coverage matrix for ordinary inputs, boundaries, refusals/permissions,
adversarial inputs, known regressions and costly failures. Include inputs where the
skill should change nothing, graded on the output staying as it should; they catch a
version that applies its rules where they do not belong. Test the grader with bad,
good and differently worded valid outputs. A no-instruction or weakened-prompt control
should expose checks that pass without the intended behavior. These development
controls do not become independent held-out observations. For the sensitivity gate,
score the control on the frozen suite as its own experiment, with the control as arm
`a` and A as arm `b`: the observed paired effect `(w-l)/n` must exceed the margin.

Keep purposively selected safety cases in the `gate` split: they can block promotion
but are excluded from the representative `test` sample and its uncertainty estimate.
Task families, paraphrases of one request, samples from one document and repeated
trials are dependent. Put them in one cluster. Use independent clusters drawn from
the declared population for general claims. A curated challenge suite is useful for
finding regressions but does not itself license a population confidence statement.

## Primary metric and uncertainty

The bundled scorer supports a binary, reliable-success endpoint. A cluster passes
for an arm only if **every case and every trial in that cluster passes**. Thus it
measures reliability of the specified task bundle at the specified repeat count,
not average per-response accuracy. Give clusters equal weight; do not casually mix
large and small bundles. Use a different preregistered estimator if a different
business metric is primary; do not force arbitrary numeric quality scores into this
endpoint after seeing them.

Let `n` be independent test clusters, `w` clusters passing only B, and `l` clusters
passing only A. The paired effect is `(w-l)/n`, positive favoring B. Calculate exact
Clopper–Pearson intervals for `w/n` and `l/n`, each at confidence `1-alpha/2`, then
subtract endpoints: `[Lw-Ul, Uw-Ll]`. A union bound gives at least `1-alpha` coverage
under independent, identically sampled clusters. This is conservative; it is our
construction, not a formula prescribed by NIST. It avoids zero-width bootstrap
intervals when every observed difference is zero. Repetitions never inflate `n`.

Choose margin `m > 0` from the smallest consequential quality change before the run.
For illustration, `m=0.05` means five percentage points of cluster reliability; it
is not a universal default worth accepting without thought. With zero discordant
clusters, the bound has half-width `1-(alpha/4)^(1/n)`. At alpha .05, at least 86
independent all-tied clusters are needed to fit within ±.05. This is a best-case
precision calculation, not a general power analysis. Discordance can require more.

## Verdict precedence

1. Missing/duplicate/extra trials, malformed grades, truncation, environment drift
   or incomplete runs: **INVALID**.
2. With validated graders, a critical test that passed all A trials fails any B
   trial: **REGRESSION**, an observed release-gate failure, not a population
   significance claim. An unvalidated grader cannot justify that verdict.
3. Arm A at or above the frozen ceiling rate on the `test` split, and the CI not
   entirely below `-m`: no verdict from this suite; run the next rung of the ladder
   (§ Ceilings and floors). On the last allowed rung: **INCONCLUSIVE**, reason
   "ceiling". The scorer does not apply this step; the agent does.
4. Without validated graders, frozen holdout, representative independent sampling,
   the predeclared minimum cluster count and a passed sensitivity gate (A beats the
   control by more than the margin): **INCONCLUSIVE**. Still report observed
   improvements/losses on the suite.
5. CI entirely above `+m`: **IMPROVEMENT**, provided B meets the quality floor
   and passes every critical case.
6. CI entirely below `-m`: **REGRESSION**.
7. CI entirely inside `[-m,+m]`: **NO_MEANINGFUL_CHANGE**, provided B meets the floor
   and passes every critical case.
8. Otherwise: **INCONCLUSIVE**.

The quality floor is an additional observed acceptance gate, not a confidence bound
on absolute success probability. Two equally poor variants do not receive a promotion
verdict. Exact text equality, paired score equality and practical equivalence are
separate measurements. Report latency/tokens separately; an efficiency-only promotion
requires a predeclared cost objective after quality non-inferiority is established.

Use one primary endpoint. Treat subgroup breakdowns as descriptive unless simultaneous
testing/multiplicity control was planned. Do not pool runs with different pins.

## Ceilings and floors

A ceiling is a suite so easy that arm A passes nearly everything, so B has no room to
differ. Two arms at full marks show the suite is too easy, not that B is as good as A.
A floor is the reverse: every arm fails. Either way the suite must change, under the
rules below, without being tuned to results already seen. The scorer does not apply
these rules; the agent applies them to the scorer's report and the control run.

**Detect.** Freeze a ceiling rate before the first run. The suite is at the ceiling
when arm A's reliable-success rate on the `test` split is at or above it. The default
is the lower of 0.90 and `1-m`. At or above `1-m`, IMPROVEMENT cannot be reached: B
can win only clusters that A failed, so the paired effect cannot exceed one minus A's
rate. At 0.90, at most one cluster in ten is left for B to win. A lower rate may be
frozen; a higher one needs a stated reason. At every rung, report the cases every arm
passes, the control included, as non-discriminating. They stay in the frozen suite and
its estimate; dropping them after the run would be editing the suite.

**Declare the ladder.** Before the first run, write into the frozen plan the
mechanisms that make a next suite harder and the order of use. Choose by mechanism,
never by which cases B passed or failed. The default order, to be reordered before
the first run where the skill calls for it:

1. Cases rebuilt from the skill's real past failures: corrections, review findings,
   bug reports and the fixes that followed.
2. For code, hidden behaviour: the visible tests cover part of the documented
   behaviour and hidden checks cover the rest. The task says the visible tests are
   incomplete, so the agent is not graded on a hidden reading.
3. Several of the skill's rules in one case.
4. Longer or messier inputs: more files, more context, distracting material.
5. Reliability across repeats: more trials per case, all of which must pass. The
   scorer already counts a cluster as passed only when every trial passes.

A rung may combine mechanisms already used. Also declare how a suite would be made
easier, for the floor case below.

**Calibrate on development cases, without B.** Write development cases for the next
rung and run only the control and arm A on them. Never run B there, and never use
the A-against-B outcome of any suite. The target is A's development success rate below
the ceiling rate by at least the margin, and the control below A by more than the
margin. When the target is missed, revise the development cases or move to the next
mechanism. Record every calibration attempt; attempts do not use a rung, because B is
never involved.

**Run each rung as a new experiment.** Never edit, regrade, trim or extend the
saturated suite. Its cases and outputs become development evidence. The next rung's
held-out cases are new, written by an author who has seen no output of the saturated
suite and no output of B. Freeze and commit them before the run, record the run as a
new one, and rerun the sensitivity gate on the new suite; an earlier gate result does
not carry over. Once a suite gives a verdict other than a ceiling, stop climbing.

**Cap the rungs.** The default cap is two rungs after the first suite, so three suites
in all. Each rung costs a new held-out set and a full run, and climbing without a cap
becomes a search for any difference, which is optional stopping by another name. The
verdict applies only to the final suite; report earlier suites by rung number as
development evidence. When the last allowed suite is still at the ceiling, the verdict
is **INCONCLUSIVE** with the reason "ceiling", the count of discordant clusters and the
interval half-width. That is a statement that no regression was seen at this
difficulty, not of equivalence.

**Floors.** When every arm, the control included, fails a case, suspect the answer key
or the grader first. Put the reference answer or fix through the grader and read the
transcripts. A fault found there is a grader or key change, which voids every earlier
score; fix it and run anew. Only a case whose key holds is truly hard. When every arm
fails the whole suite, or arm A passes too little for the sensitivity gate, check the
graders the same way, then lower the difficulty by the same procedure: a declared
step down, calibrated on development cases with the control and A, with new held-out
cases, counted against the same cap.

## Rewrites and compactions

A rewrite or compaction of a skill must keep its behavior, so A is the current text
and B the edit. Write and commit the cases before editing B, and pin A to that commit.
Prefer an author who will not edit B: whoever knows the cases can shape B to pass them.

One case per rule is necessary but not sufficient, because those cases come from the
text and test what its author thinks the rules are. Add gate cases rebuilt from the
skill's past real failures: corrections, review findings and bug reports. A useful
weakened control is A with the rule under test removed; a case that still passes
then tests the model, not the skill.

## Source basis

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  distinguishes tasks, trials, graders, transcripts and actual outcomes; recommends
  appropriate code/model/human graders and separate capability/regression suites.
  It also defines eval saturation, separates passing at least once in k trials from
  passing all k, advises starting from tasks drawn from real failures, testing where a
  behaviour should not occur as well as where it should, and reading transcripts to
  know whether graders work.
- [Anthropic: A statistical approach to model evaluations](https://www.anthropic.com/research/statistical-approach-to-model-evals)
  supports clustering standard errors on the unit of randomisation, paired
  differences between two systems on the same questions, and checking power first.
- [Anthropic: Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
  supports evaluation tasks built from realistic uses, each paired with a verifiable
  outcome, held-out test sets against overfitting, and reading raw transcripts.
- [Anthropic: Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  supports a no-skill baseline and testing with each model the skill will run on.
- [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
  runs each case with and without the skill or against a snapshot of the old version,
  flags checks that pass regardless of the skill, and tests description triggering
  in a separate loop with its own held-out queries.
- [Aider: the polyglot benchmark](https://aider.chat/2024/12/21/polyglot.html)
  replaced a code-editing benchmark that was saturating with a new, harder problem set,
  the precedent for answering a ceiling with a new suite.
- [METR: Measuring AI ability to complete long tasks](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/)
  orders tasks by the time an expert needs and shows success falling along that
  scale, the idea behind an ordered difficulty ladder.
- [Hamel Husain and Shreya Shankar: evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
  supports reading traces before building checks, binary pass/fail checks, and
  validating a model judge against human labels on held-back data.
- [Eugene Yan: Evaluating the effectiveness of LLM-evaluators](https://eugeneyan.com/writing/llm-evaluators/)
  reports position bias in model judges and favours pairwise comparison for
  subjective quality, the reasons for order reversal in [JUDGING.md](JUDGING.md).
- [Inspect](https://inspect.aisi.org.uk/) runs untrusted model code in a container or
  similar sandbox, the boundary JUDGING.md draws for executable graders.
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
  supports task-specific datasets, continuous evaluation, human calibration and
  pairwise/rubric approaches. Provider tooling is optional; the evaluation principles
  apply to local models too.
- [NIST TN 2106, Comparing Instruments](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2106.pdf)
  discusses paired comparisons, uncertainty and equivalence testing with a prespecified
  indifference zone. Its measurement-instrument examples motivate the logic here;
  their specific distributional formulas must not be copied onto incompatible metrics.
- [NIST AI 800-3, Statistical Models](https://doi.org/10.6028/NIST.AI.800-3)
  explains how assumptions about benchmark sampling affect uncertainty estimates.
- [SciPy exact binomial interval documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html)
  identifies the Clopper–Pearson construction used for each marginal rate here.
- [Promptfoo configuration](https://www.promptfoo.dev/docs/configuration/guide/) and
  [Ollama provider](https://www.promptfoo.dev/docs/providers/ollama/) are established
  alternatives for projects already using that harness. Keep its adapters and assertions
  rather than migrating solely to use this skill; validate exported evidence before scoring.
