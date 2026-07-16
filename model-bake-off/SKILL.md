---
name: model-bake-off
description: 'Run a controlled bake-off to pick the optimal model tier for a *class* of task — write a task-specific rubric first, run the same prompt across candidate models at matched effort, score the outputs blind (verifying load-bearing facts), then rank by ACTUAL DOLLAR COST rather than token count (per-token prices differ several-fold across tiers, so token count alone inverts the true ranking) to produce a quality-per-dollar recommendation. Gathers the inputs from the user, then dispatches the `model-bake-off` Workflow, which enforces the ordering (rubric before outputs), the blinding (judges never see the model id), and the pricing arithmetic in code. Use when choosing which model/tier to standardise on for a recurring task, comparing models head-to-head, running a model shootout / bake-off / eval, deciding whether a pricier tier earns its premium over a cheaper one, or when the user asks "which model is best/cheapest for this", "is the flagship worth it over the mid tier", or invokes /model-bake-off.'
---

# model-bake-off

Pick the model by **evidence, not vibes or price-tag intuition.** The deliverable is a per-task-class recommendation backed by a rubric score and an **actual-dollar** cost — never a token count, never a guess.

The bake-off itself runs as a **Workflow** (`.claude/workflows/model-bake-off.js`). That is deliberate: three of this skill's rules are structural, not advisory, and prose cannot enforce them.

| Rule | How the workflow enforces it |
|---|---|
| Rubric written **before** any output is read | The rubric agent runs in phase 1 and no candidate has been invoked yet. It cannot be anchored by an output that does not exist. |
| Scoring is **blind** | Judges are handed an alias (`A`, `B`, …) and the output. The script holds the alias→model map and does not unblind until the verdict. |
| Rank by **dollars**, never tokens | The pricing and value-per-dollar arithmetic is plain JS, so it cannot be eyeballed or rationalised. Rates come from a live `claude-api` lookup, and the run **aborts** if any candidate has no rate. |

Your job is the part a script cannot do: **gather the inputs, then dispatch.**

## The one rule that flips people's intuition

**Rank by dollars, never by tokens.** Per-token prices differ several-fold across tiers, so the model that emits the *most* tokens is frequently the *cheapest* in dollars — and the one that emits the fewest can be the most expensive. The workflow computes both rankings and makes the verdict say so out loud when they disagree.

## 1. Gather the inputs

Do not guess these. A bake-off built on a paraphrased prompt or an invented candidate list is unauditable.

- **`taskClass`** — the *kind* of work, not the one instance: planning/triage, mechanical breadth, hard reasoning/debugging, long-horizon agentic execution, creative generation. The recommendation only generalises within the class. If the user gave you one instance, name the class it belongs to and confirm.
- **`prompt`** — the **exact prompt, verbatim.** Not a paraphrase, not a summary. This is the seed that lets someone re-check the verdict against a tier that ships next year. If you only have a description of the prompt, ask for the real thing.
- **`candidates`** — `{tier, modelId}` entries that **span tiers** (a small, a mid, a flagship, and the top tier if the task might need the headroom). Get the current lineup and model ids from the `claude-api` skill — **never from memory.**
- **`effort`** — one setting, applied to every candidate. Matched effort or the comparison is meaningless.
- **`usage`** *(optional, per candidate)* — `{inputTokens, outputTokens}` if you already have real numbers from a prior run. Supply them and the workflow prices exactly; omit them and it measures output tokens and brackets the unknown input across plausible ratios.

## 2. Dispatch

```
Workflow({
  name: 'model-bake-off',
  args: {
    taskClass: 'hard reasoning / debugging',
    prompt: '<<<the exact prompt, verbatim>>>',
    effort: 'medium',
    candidates: [
      { tier: 'haiku',  modelId: 'claude-haiku-4-5-20251001' },
      { tier: 'sonnet', modelId: 'claude-sonnet-5' },
      { tier: 'opus',   modelId: 'claude-opus-4-8' },
    ],
    harness: 'default workflow subagent, full tools, no custom system prompt',
  },
})
```

Invoking this skill **is** the user's opt-in to multi-agent orchestration — the bake-off cannot be run any other way. It spends real tokens on every candidate, so confirm the candidate list before dispatching.

> Running the skill from a repo other than this one? Named resolution reads `.claude/workflows/` in the current repo. Elsewhere, pass `scriptPath` pointing at this repo's copy instead of `name`.

## 3. Report the verdict

The workflow returns the verdict, the scored/priced table, both rankings, and a `reproduction` block. Relay:

- The **headline** — which model to standardise on for this class.
- The **per-model verdicts** (best-value / budget / framing pre-pass / over-provisioned / below-capability-floor) — a recommendation, never a bare "model X wins".
- **Whether the dollar ranking contradicted the token ranking.** This is the trap the exercise exists to catch; if it fired, lead with it.
- **Whether the ranking was robust** across input/output splits. If `rankingRobust` is false, say so plainly and state what usage data would settle it — do not declare a winner.
- Any **refuted load-bearing claims**, and which model made them.

## Patterns worth naming (they recur across bake-offs)

- **Token count ≠ cost.** The headline trap. The token ranking and the dollar ranking often point opposite ways.
- **Capability floor.** Some tasks need a minimum capability to produce the deliverable *at all*. Below it, a model degrades — ideally into *framing + clarifying questions* (graceful) rather than a confident wrong answer.
- **Graceful degradation > confident error.** A cheap model that *asks* often beats a slightly pricier one that *asserts* something false — weigh the failure mode, not just the score. The workflow captures this as a `failureMode` on every score.
- **Over-provisioning is real.** The top tier is built for hard, long-horizon work; on a bounded task it bills a premium for headroom the task never exercises.
- **Investigation budget is the hidden variable.** When the answer lives in a codebase or docs, a model's willingness to read/search matters more than raw speed — but it also drives token (and dollar) cost. Judge whether the extra reading *paid for itself*.

## Definition of done

- Rubric written **before** any output was read *(structural — phase 1)*.
- The **exact prompt recorded verbatim**, with model ids and effort/harness settings *(returned in `reproduction`)*.
- Every candidate scored on the same rubric, **blind** *(structural — judges see aliases)*.
- Load-bearing facts in each answer verified against real evidence — accuracy scored, not fluency.
- Cost in **dollars** at current rates pulled from `claude-api`, ranking shown robust to the input/output split.
- Recommendation framed **per task-class**, not a bare winner.
