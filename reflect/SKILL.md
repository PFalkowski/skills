---
name: reflect
description: 'Surface the assumptions a task rests on, rank each by how much of the work it carries, and route it: look it up, verify it, default it and say so, or ask. Fixes both failure modes at once - blocking on trivia while silently guessing the load-bearing detail. Triggers: reading a task before starting; the urge to ask a question; about to proceed on something the request did not state; new information contradicts a prior belief; "reflect", "what are you assuming", "sanity check", "step back".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# reflect

*"What am I assuming, and which of it would sink the work if wrong?"*

Agents fail this in two directions at once, and both come from one root cause. They stop to ask about a
branch name or a filename, because a fork they can *see* feels like a decision. Then they build on the wrong
target framework, delete a function that has callers, or violate a constraint the ticket stated, because an
assumption they filled in *without noticing* never felt like a decision at all. The visible fork is cheap; the
invisible one is load-bearing. The agent asks about the first and never ranks the second, because it never
wrote it down.

`reflect` is the missing upstream step: **enumerate the assumptions, rank them by load, route each.**
[`whatever`](../whatever/SKILL.md) is the routing rule for the cheap ones. [`fact-check`](../fact-check/SKILL.md)
grounds a claim once you have one. Neither produces the list. This does.

## When to reflect

- **Before starting** any task that is more than a one-liner: after reading the request and before the first edit.
- **When you feel the urge to ask a question.** Run it through the ledger first; most questions dissolve into
  "look it up" or "default it".
- **When you are about to proceed on something the request did not state.** That feeling of "obviously X" is
  the trigger, not a reason to skip it.
- **When new information contradicts something you believed.** Do not absorb it and carry on; re-rank.
- **At checkpoints** of long work: before a commit, before a PR, before handing off.
- On request: "reflect", "what are you assuming", "sanity check", "step back".

## The ledger

List every assumption the plan rests on. Three columns of origin:

| Origin | What it is | Danger |
|---|---|---|
| **Given** | The user or the ticket stated it | Low; you can still misread it, so quote it, do not paraphrase |
| **Inferred** | You filled it in from context, convention, or habit | **This is where the damage lives** |
| **Unknown** | You have not thought about it yet | Found only by the pre-mortem below |

The **inferred** column is the point of the exercise. Write it out honestly, including the boring ones:
"the tests run with `dotnet test` from the root", "this function has no other callers", "the user wants
the change on this branch", "the public API may change", "the existing style is the intended style".

### Rank by load, not by uncertainty

The wrong question is "how sure am I?". The right one is:

> **If this is wrong, is the deliverable useless, or merely slightly different?**

- **High load**: wrong means rework, a wrong outcome, or a violated constraint. The work *rests* on it.
- **Low load**: wrong means a one-line correction from the user. The work merely *touches* it.

Certainty is irrelevant to the ranking. A 95%-confident high-load assumption still needs grounding; a
coin-flip low-load one still gets defaulted. Agents get this backwards because uncertainty is what they
*feel*, and load is what they have to *compute*.

### Route each item

Work down this list and take the **first** route that applies:

1. **Discoverable → go look. Never ask what the repo can answer.** The target framework is in the project
   file. Whether a function has callers is one grep. What the ticket forbids is in the ticket. The house
   conventions are in the README, CLAUDE.md, or the last ten commits. Most "critical details" agents miss
   were discoverable; the failure was skipped reading, followed by a guess or a question the code would
   have answered. Cite the `path:line` in the ledger once found.
2. **Executable or documentable → [`fact-check`](../fact-check/SKILL.md).** A behaviour, a limit, a version,
   an API contract. Run it or cite it.
3. **Low load and reversible → decide, state it in one line, keep moving.** This is
   [`whatever`](../whatever/SKILL.md), applied to exactly the items the ledger marked low load. Do not ask.
4. **High load, not discoverable, a genuine preference or requirements fork → ask.** Batch every such item
   into one checkpoint, lead each with a recommendation, and make sure the question cannot be answered by
   step 1. This should be rare. If it is not rare, you skipped step 1.
5. **High load and unanswerable now → proceed and flag.** State the assumption explicitly in the deliverable
   (the PR body, the report, the handover) so a wrong guess is caught at review rather than in production.
   Do not bury it.

### Pre-mortem for the unknown column

You cannot rank an assumption you never wrote down. Two prompts reliably surface the missed ones:

- **"The user rejects this work. Why?"** Answer it three times with three different reasons. Each reason is
  an assumption; add it to the ledger and route it.
- **"What did the request *not* say that I am treating as settled?"** Scope (which files, which callers,
  which environments), constraints (compatibility, public API, performance, security), definition of done
  (tests, docs, migration), and the thing the ticket mentioned in passing that you skimmed.

Then route the new items like the rest. This step is where the "critical detail the agent missed" gets caught,
and it costs one minute.

## Emitting the ledger

Keep it proportional. **Noise trains the user to ignore it.**

- **If any inferred item is high-load**: emit the ledger before starting, as a short block. One line per item:
  assumption, load, status (given / verified `path:line` / defaulted / asked / flagged). Skip the low-load
  lines or collapse them into one sentence.
- **If everything inferred is low-load**: one sentence naming the defaults, as `whatever` would. No block.
- **At checkpoints**: emit only the lines whose status changed, or that were added.

Example, high-load case:

```
Assumptions
- Target is net8.0 (verified: Directory.Build.props:4)
- `ParseQuote` has no callers outside this assembly (verified: grep, 2 call sites, both updated)
- Public API may not change (given: ticket says "internal refactor only")
- Flagged: existing tests never cover the empty-input path; I am treating current behaviour as intended.
Defaults: new branch off main, tests alongside the file under test.
```

## Re-reflect on contradiction

Mid-task, something you read contradicts a ledger line. The reflex is to reconcile it quietly and continue.
Instead: stop, mark the line broken, and re-rank. A broken low-load line is a one-line update. A broken
high-load line means the plan built on it is suspect; the deliverable may be useless, and the honest move is
to say so and re-route, which may mean asking now what you correctly did not ask before.
[`walk-the-dog`](../walk-the-dog/SKILL.md) names this moment `ESCALATE` for a subagent; the same rule applies
to you.

## `reflect deep`

For load-bearing work (a public API, a migration, a security-sensitive change, anything
[`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) would take), the author of a plan is the worst person to
find its unstated assumptions. Spawn a fresh subagent that never saw the reasoning, hand it only the request
and the plan, and ask it for the ledger: what is inferred, what is high-load, what the pre-mortem turns up.
Merge its findings into yours. This is the [`code-review-grill`](../code-review-grill/SKILL.md) stance applied
to a plan instead of a diff. Optional, not the default.

## Anti-patterns

- **Asking what a grep would answer.** The single most common miss. Step 1 exists to stop it.
- **Ranking by confidence.** "I'm fairly sure" is not a status. Load is.
- **Filling the ledger only with things you already checked.** The inferred column has to contain the
  embarrassing ones, or it is theatre.
- **Emitting a twelve-line ledger for a typo fix.** Proportionality is part of the skill.
- **Reconciling a contradiction silently.** A broken assumption is news; report it as news.
- **Paraphrasing a given.** Quote the constraint. Paraphrase is where "do not change the public API" turns
  into "keep it mostly compatible".
- **Treating "the user said just do it" as permission to stop reflecting.** It lowers the asking threshold
  (route 4), not the looking threshold (route 1). Routes 1, 2 and 5 still run.

## Relationship to sibling skills

- [`whatever`](../whatever/SKILL.md): the rule for the low-load bucket. `reflect` decides which items are in
  that bucket; `whatever` handles them.
- [`fact-check`](../fact-check/SKILL.md): the tool for grounding one item.
- [`triage`](../triage/SKILL.md) READINESS and [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) grilled
  requirements: the same check at the ticket level, before work starts. `reflect` is the moment-to-moment
  version inside a task.
- [`manager`](../manager/SKILL.md): verdicts on someone else's asks. `reflect` is about your own.
