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

Construct a coverage matrix for ordinary inputs, boundaries, refusals/permissions,
adversarial inputs, known regressions and costly failures. Test the grader with bad,
good and differently worded valid outputs. A no-instruction or weakened-prompt control
should expose checks that pass without the intended behavior. These development
controls do not become independent held-out observations.

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
3. Without validated graders, frozen holdout, representative independent sampling
   and the predeclared minimum cluster count: **INCONCLUSIVE**. Still report observed
   improvements/losses on the suite.
4. CI entirely above `+m`: **IMPROVEMENT**, provided B meets the quality floor.
5. CI entirely below `-m`: **REGRESSION**.
6. CI entirely inside `[-m,+m]`: **NO_MEANINGFUL_CHANGE**, provided B meets the floor.
7. Otherwise: **INCONCLUSIVE**.

The quality floor is an additional observed acceptance gate, not a confidence bound
on absolute success probability. Two equally poor variants do not receive a promotion
verdict. Exact text equality, paired score equality and practical equivalence are
separate measurements. Report latency/tokens separately; an efficiency-only promotion
requires a predeclared cost objective after quality non-inferiority is established.

Use one primary endpoint. Treat subgroup breakdowns as descriptive unless simultaneous
testing/multiplicity control was planned. Do not pool runs with different pins.

## Source basis

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  distinguishes tasks, trials, graders, transcripts and actual outcomes; recommends
  appropriate code/model/human graders and separate capability/regression suites.
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
