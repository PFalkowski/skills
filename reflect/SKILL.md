---
name: reflect
description: 'Before work or a sanity check, route assumptions to research, verification, defaults or user questions.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# reflect

Enumerate assumptions, rank them by consequence, and route each before editing.

## When to reflect

Before tasks larger than a one-line change; before asking a question or acting on an unstated premise; when evidence contradicts a premise; and before commits, PRs, or handoff. Several steps spent on one obstacle trigger the direction check below. Also use on request: "reflect", "sanity check", "step back", or "is this worth it".

## The ledger

Classify assumptions as **Given** (quote the user/ticket exactly), **Inferred** (filled in from context or habit), or **Unknown** (surface through the pre-mortem). Include scope, callers, environment, branch, compatibility, public API, and definition of done; do not list only assumptions already checked.

### Rank by load, not by uncertainty

**High load:** being wrong causes rework, a wrong outcome, or a violated constraint. **Low load:** a one-line user correction suffices. Confidence does not change this ranking.

### Route each item

Low load goes directly to route 3. High load takes the first applicable route among 1, 2, 4, 5:

1. **Discoverable:** inspect the repo/ticket/history; cite `path:line`. Never ask what a search can answer.
2. **Executable or documentable:** use [`fact-check`](../fact-check/SKILL.md) to run or source the claim.
3. **Low load:** decide, state the default in one line, continue. Look up only if cheaper than defaulting; do not ask. This is [`whatever`](../whatever/SKILL.md)'s consequential/hard-to-reverse/underdetermined test.
4. **High load, undiscoverable preference or requirements fork, human available:** batch questions into one checkpoint, each with a recommendation.
5. **High load, unattended or decision delegated:** proceed and flag the assumption prominently in the PR/report/handoff for review.

### Pre-mortem for the unknown column

Use [`invert`](../invert/SKILL.md): name three different reasons the user might reject the work, then ask what the request left unstated that you treated as settled. Add and route each assumption.

## Emitting the ledger

If any inferred item is high-load, emit a short block before starting: assumption, load, and status (`given`, `verified path:line`, `defaulted`, `asked`, `flagged`). Collapse low-load defaults into one sentence. If all inferred items are low-load, emit only that sentence. At checkpoints, report only added or changed lines.

## Re-reflect on contradiction

Stop, mark the contradicted line broken, and re-rank. Update a low-load line briefly; a broken high-load line requires reporting the suspect plan and re-routing, possibly asking now. [`walk-the-dog`](../walk-the-dog/SKILL.md) calls this `ESCALATE`. Delegated autonomy changes who decides, not the obligation to discover and verify.

## Are we still going the right way?

At checkpoints or after several steps on one obstacle:

1. Quote the user's objective.
2. Name how the current work advances it; an unrelated flaky test is not a necessary dependency.
3. Decide whether the user would prefer a workaround over waiting for a complete fix.

### Token-box the obstacle

For an off-path or uncertain obstacle, state an attempt/token budget before continuing. When spent, stop solving it, work around it, and return to the objective. Record the obstacle and attempts as an open item in the deliverable. Decide the stopping rule before spending the budget.

### Push back

If the premise is false, conflicts with the code, treats a symptom, or has a cheaper alternative, explain the finding and recommendation in two sentences before work. With a human present, wait for their answer; unattended, do what was asked and place the concern atop the deliverable. Once the user confirms, proceed fully without repeating the objection.

## `reflect deep`

Optional for load-bearing work such as APIs, migrations, security, or [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md): give a fresh subagent only the request and plan, not the author's reasoning. Ask for inferred/high-load assumptions and pre-mortem findings; merge them into the ledger.

## Relationship to sibling skills

[`whatever`](../whatever/SKILL.md) handles low-load choices; [`fact-check`](../fact-check/SKILL.md) grounds claims. [`triage`](../triage/SKILL.md) READINESS and [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) apply this check to tickets and requirements. [`manager`](../manager/SKILL.md) adjudicates other agents' questions.
