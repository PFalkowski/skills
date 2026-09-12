---
name: invert
description: 'Solve a problem backwards — name what would guarantee failure, then make each of those impossible. Use on a plan that reads as a list of steps with no way to be wrong, when the forward path is stuck, or before a change that is hard to reverse.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# invert

Ask what would guarantee failure, not what would produce success, then make each of those things
impossible. Jacobi solved hard problems this way and Munger made the rule famous: *invert, always
invert*.

The forward question has an unbounded answer space, which is why a plan built from it reads as a
list of steps with no way to be wrong. The inverted one is short, concrete, and checkable.

## The move

1. **Name the failures, not the risks.** Write the sentence someone says afterwards: "it shipped
   and then X." Three is usually enough. Each has to be specific enough that it could turn out to
   be wrong. "It might be slow" is not a failure; "the per-row query runs forty thousand times on
   the nightly import" is.
2. **Check whether the plan already does one of them.** This is the step that pays. Usually one of
   the three is already in the plan and was invisible from the forward side.
3. **Block each one, or write down why it cannot happen.** A failure you cannot block is a stated
   assumption, so put it where a reviewer will see it — the PR body, the report, the handover.

Stop when you cannot name a failure that is not already blocked. The forward question gives no
stopping rule at all, which is why plans built from it end when the author gets tired.

## Reach for it when

- A plan, spec or design reads as a list of steps.
- The forward path is stuck. This was Jacobi's own use: the backwards statement is often the easy one.
- You are about to agree with something you wrote.
- The change is hard to reverse, or the cost of being wrong is not symmetric.

## What it is not

- **Not a risk register.** A list nobody acts on is worse than no list, because it turns a live
  worry into a filed one. Step 3 is the skill; step 1 alone is theatre.
- **Not pessimism, and not grounds to refuse the work.** Inversion finds what to avoid so the work
  can go ahead, not reasons it should not.
- **Not the whole answer.** You still owe the forward path. Inversion only tells you which forward
  paths are already dead.
- **Not once, at the start.** The second useful moment is when you are stuck; the third is before
  you hand the work to someone else.

## Relationship to sibling skills

- [`reflect`](../reflect/SKILL.md) — its pre-mortem is this move aimed at the assumptions a task
  rests on, and its ledger is where an unblockable failure gets flagged.
- [`code-review-grill`](../code-review-grill/SKILL.md) — this move aimed at a diff: what input
  breaks it, which caller relied on the old behaviour.
- [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) — Phase 5 grills the plan this way, in a
  fresh process that did not write it.
- [`nights-watch`](../nights-watch/HUNT.md) — the refuters are this move mechanised: a candidate is
  reported only after an agent has tried to kill it and failed.
- [`fact-check`](../fact-check/SKILL.md) — grounds one claim. Inversion picks which claim is worth
  the trouble.
