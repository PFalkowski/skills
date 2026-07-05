---
name: model-bake-off
description: 'Run a controlled bake-off to pick the optimal model tier for a *class* of task — write a task-specific rubric first, run the same prompt across candidate models at matched effort, score the outputs blind (verifying load-bearing facts), then rank by ACTUAL DOLLAR COST rather than token count (per-token prices differ several-fold across tiers, so token count alone inverts the true ranking) to produce a quality-per-dollar recommendation. Use when choosing which model/tier to standardise on for a recurring task, comparing models head-to-head, running a model shootout / bake-off / eval, deciding whether a pricier tier earns its premium over a cheaper one, or when the user asks "which model is best/cheapest for this", "is the flagship worth it over the mid tier", or invokes /model-bake-off.'
---

# model-bake-off

Pick the model by **evidence, not vibes or price-tag intuition.** The deliverable is a per-task-class recommendation backed by a rubric score and an **actual-dollar** cost — never a token count, never a guess.

## The one rule that flips people's intuition

**Rank by dollars, never by tokens.** Per-token prices differ several-fold across tiers, so the model that emits the *most* tokens is frequently the *cheapest* in dollars — and the one that emits the fewest can be the most expensive. Convert token usage to money at the **current** per-token rates before you rank anything.

> Get the current model lineup and per-token input/output rates from the `claude-api` skill (or official pricing). **Never price from memory** — rates and models change, and a stale number silently corrupts the whole verdict.

## Runbook

Work top to bottom. Don't skip step 2 — a rubric written *after* reading outputs is anchored and worthless.

### 1. Name the task *class*, not the one instance
The optimal model depends on the *kind* of work: planning/triage, mechanical breadth, hard reasoning/debugging, long-horizon agentic execution, creative generation. State which class this is — the recommendation only generalises within it. Pick candidates that **span tiers** (a small, a mid, a flagship, and the top "most-capable" tier if the task might need the headroom).

### 2. Write the rubric BEFORE you see any output
Criteria tuned to what *this class* actually rewards. Two criteria are mandatory on every rubric:
- **Accuracy / did-it-verify** — fluency ≠ correctness. A confident, well-written wrong answer must score *below* a hedged correct one.
- **Cost-efficiency (quality ÷ $)** — scored *last*, after pricing.

Score **blind** where you can (hide which model produced which output) to avoid halo/anchoring effects.

### 3. Run the same prompt across all candidates, at matched effort
Identical prompt, identical effort/verbosity setting. Record each output **and its token usage** — the input/output split if you have it, the total otherwise.

### 4. Score, and verify the load-bearing claims
Score each output against the rubric. Call out the few **load-bearing moves** that separate a strong answer from a generic one — they are task-specific (e.g. catching that the request is already satisfied, pushing back on a shaky premise, refusing to fabricate a result it lacks data for). Then **verify every fact the answer leans on**: a confident-but-wrong load-bearing claim is worse than an honest "I couldn't confirm X" and should drop that model hard.

### 5. Price it — actual dollars
```
blended $/1M = input_fraction × input_price + output_fraction × output_price
cost        = tokens_used × blended_$/1M ÷ 1e6
```
If you don't have the input/output split, **bracket** it: a floor (treat all tokens as input) and a plausible estimate (e.g. 80/20 input/output for read-heavy agentic runs). If the ranking is identical under every split you try, the conclusion is robust — stop there.

### 6. Deliver the verdict — quality ÷ dollars, per task-class
Give a **recommendation, not a single winner**:

| Verdict | Meaning |
|---|---|
| **Best answer / value** | Top quality at a sane cost — the default pick for this class. |
| **Budget** | Delivers the actual deliverable for materially less; note what you trade. |
| **Framing pre-pass** | Cheapest tier; produces structure and the right questions, *not* the final answer — use before handing off to a bigger model. |
| **Over-provisioned** | Most expensive, no quality edge here — reserve for tasks whose difficulty needs it. |

## Patterns worth naming (they recur across bake-offs)

- **Token count ≠ cost.** The headline trap. Always reprice in dollars; the token ranking and the dollar ranking often point opposite ways.
- **Capability floor.** Some tasks need a minimum capability to produce the deliverable *at all*. Below it, a model degrades — ideally into *framing + clarifying questions* (graceful) rather than a confident wrong answer.
- **Graceful degradation > confident error.** A cheap model that *asks* often beats a slightly pricier one that *asserts* something false — weigh the failure mode, not just the score.
- **Over-provisioning is real.** The top tier is built for hard, long-horizon work; on a bounded task it bills a premium for headroom the task never exercises.
- **Investigation budget is the hidden variable.** When the answer lives in a codebase or docs, a model's willingness to read/search matters more than raw speed — but it also drives token (and dollar) cost. A model that reads one file and asks is cheap but may miss the answer; one that reads ten finds it but costs more. Judge whether the extra reading *paid for itself*.

## Definition of done

- Rubric written **before** any output was read.
- Every candidate scored on the same rubric, blind where feasible.
- Load-bearing facts in each answer verified — accuracy scored, not just fluency.
- Cost in **dollars** at current rates (pulled from `claude-api`, not memory), ranking shown robust to the input/output split.
- Recommendation framed **per task-class** (best / budget / framing pre-pass / over-provisioned), not a bare "model X wins".
