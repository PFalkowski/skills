---
name: orchestrate
description: 'Given a task, design and run the SMALLEST agent system that fits it — escalating only as far as the task needs (single call -> workflow -> orchestrator-workers -> autonomous agent), picking the pattern from Anthropic''s agent taxonomy, sizing effort to complexity, giving each worker a sharp brief (objective / output / tools / boundaries), spawning them, and synthesizing. Defaults to NOT multi-agent — a multi-agent system costs ~15x the tokens of a single chat, so it is reserved for high-value, genuinely parallelizable work. Use when the user wants to break a task across subagents, parallelize research or implementation, spin up a crew of agents, right-size a complex multi-step job, or asks how to structure one.'
---

# orchestrate — cut the smallest agent system that fits

**Escalate reluctantly.** Most tasks need one agent, often zero. A multi-agent system uses **~15× the tokens** of a single chat ([Anthropic, multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)) — pay that only when the task is **high-value AND genuinely parallelizable**. This skill's job is to pick the *least* machinery that does the task well, define it sharply, run it, and synthesize. More agents is not better; the right number is the smallest that covers the work without overlap.

## Step 1 — Size the task (escalation ladder)

Pick the **lowest** rung that fits ([Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)):

| Rung | Use when | Shape |
|---|---|---|
| **Single LLM call** | One step, fully specifiable, low cost-of-error | Just do it. No orchestration. |
| **Workflow** (code-orchestrated, predictable) | Decomposes into steps known **up front** | chaining / routing / parallelization / evaluator-optimizer |
| **Orchestrator-workers** | Subtasks **cannot** be predicted up front; a lead must decompose dynamically | 1 lead decomposes → N workers (own context) → lead synthesizes |
| **Autonomous agent** | Open-ended, many steps, needs ground-truth feedback each step | one agent looping with tools until done |

**Gate before leaving "single call"** — all four must hold, or drop a rung (Anthropic "Should I build an agent?"):
**Complexity** (multi-step, hard to fully specify) · **Value** (justifies higher cost + latency) · **Viability** (Claude is genuinely good at this) · **Cost of error** (mistakes are catchable — tests, review, rollback).

**Multi-agent pays off only** for tasks with heavy parallelization, information exceeding one context window, or many complex tools. It is a **poor fit** when agents must share the same context or have many interdependencies — those stay single-agent.

## Step 2 — Pick the pattern

- **Prompt chaining** — fixed sequential steps; each output feeds the next. Trade latency for accuracy.
- **Routing** — classify the input, send to a specialized handler. Distinct categories handled better apart.
- **Parallelization** — *Sectioning* (independent subtasks at once) or *Voting* (same task N times for coverage/confidence).
- **Orchestrator-workers** — lead dynamically decomposes and delegates; use when subtasks are not known in advance.
- **Evaluator-optimizer** — generator + critic loop; use when you have clear eval criteria and refinement measurably helps.

## Step 3 — Cut each worker's brief (the step everyone skips)

Vague delegation is the #1 multi-agent failure — workers "duplicate work, leave gaps, or fail to find necessary information." Every spawned worker gets, **explicitly**:

- **Objective** — the one outcome it owns, in a sentence.
- **Output format** — exactly what to return, so the lead can synthesize without re-reading raw work.
- **Tools / sources** — which to use, which to ignore; tell it to review what is available first.
- **Boundaries** — what is in scope and explicitly **out** of scope (this is what prevents overlap and gaps).

One worker per **independent slice** — never one per step of a sequence (a sequence is chaining, run it as a workflow).

## Step 4 — Budget effort to complexity (stop over-spawning)

Embed the budget in the plan; do **not** let agents self-scale (they over-spawn — "50 subagents for a simple query"). Calibrated from the research system:

- **Simple fact-find** → 1 worker, ~3–10 tool calls.
- **Direct comparison** → 2–4 workers, ~10–15 calls each.
- **Complex / open-ended** → 10+ workers, sharply divided responsibilities.

Default low. Add a worker only when a clear independent slice exists.

## Step 5 — Run it (Claude Code)

- Spawn each worker with the **Agent/Task tool** — one call per worker, independent workers **in parallel in a single message**. Pass the Step-3 brief verbatim as the worker's prompt.
- Keep the **lead = this session** as the synthesizer. The lead holds the plan and merges results; it does **not** do the workers' digging itself.
- **Cheaper model for narrow workers** (Explore/Haiku-class) to tame the token multiplier; keep the lead on the stronger model. Workers in parallel each get their own context window — that is the compression win.
- Workers return their Output-format payload; never dump raw worker transcripts at the user.

## Step 6 — Synthesize + verify

- Merge worker outputs against the **original objective**. Name gaps/conflicts; reconcile, or spawn **one targeted follow-up** worker — not a fresh crew.
- **Transparency:** show the plan (pattern · workers · per-worker briefs · budgets) **before** running so the user can veto, and show which worker produced what.

## Anti-patterns

- Reaching for multi-agent on a task one good agent does in a single pass — you just paid ~15× for nothing.
- Workers with shared or interdependent context — that is one agent, not a crew.
- A worker per step of a sequence — that is prompt chaining; run it as a workflow.
- Spawning before the four-part briefs are written — guarantees duplication and gaps.
- Letting the model self-decide the worker count — embed an explicit budget.
- Returning raw subagent output instead of a synthesis.

## Quick reference

| Situation | Do |
|---|---|
| Task is one step / fully specified | Single LLM call — no orchestration |
| Steps known up front | Workflow (chaining / routing / parallelization / evaluator-optimizer) |
| Subtasks emerge dynamically, parallelizable, high-value | Orchestrator-workers |
| Open-ended, needs feedback loops | Autonomous agent (one looping agent) |
| About to spawn a worker | Write objective / output / tools / boundaries first |
| Unsure how many workers | Start at 1; add one per independent slice; cap by the effort-budget tier |
| Workers share context / depend on each other | Collapse to a single agent |
| Workers finished | Lead synthesizes against the objective; one follow-up worker for gaps, not a new crew |

Grounded in Anthropic's [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) (pattern taxonomy, escalation, simplicity/transparency/tool-design principles) and [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (orchestrator-worker lessons, ~15× token rule, per-worker briefs, effort budgets, over-spawning failure mode).
