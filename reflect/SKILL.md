---
name: reflect
description: 'Enumerate the assumptions a task rests on, rank each by how much work it carries, and route it: look up, verify, default, or ask; token-box obstacles off the objective and push back on a wrong request. Triggers: before starting; the urge to ask; many steps on one obstacle; "what are you assuming", "sanity check", "is this worth it".'
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
- **When the last several steps were all about one obstacle.** That is the drift signal; see
  [Are we still going the right way?](#are-we-still-going-the-right-way).
- On request: "reflect", "what are you assuming", "sanity check", "step back", "is this worth it".

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

Load is the first split. **Low load** goes straight to route 3. **High load** works down routes 1, 2, 4, 5
and takes the first that applies.

1. **Discoverable → go look. Never ask what the repo can answer.** The target framework is in the project
   file. Whether a function has callers is one grep. What the ticket forbids is in the ticket. The house
   conventions are in the README, CLAUDE.md, or the last ten commits. The details agents miss are usually
   the ones nobody looked up: skipped reading, then a guess or a question the code would have answered.
   Cite the `path:line` in the ledger once found.
2. **Executable or documentable → [`fact-check`](../fact-check/SKILL.md).** A behaviour, a limit, a version,
   an API contract. Run it or cite it.
3. **Low load → decide, state it in one line, keep moving.** This is [`whatever`](../whatever/SKILL.md)'s
   test with the mapping made explicit: load covers its consequential and hard-to-reverse prongs, and
   discoverable covers its underdetermined prong. Do not look it up unless the lookup is cheaper than the
   one-line default. Do not ask.
4. **High load, not discoverable, a genuine preference or requirements fork, and a human is in the loop →
   ask.** Batch every such item into one checkpoint, lead each with a recommendation, and make sure the
   question cannot be answered by step 1. This should be rare. If it is not rare, you skipped step 1.
5. **High load and no one to ask → proceed and flag.** This is route 4 during an unattended run, or after
   the user delegated the decision. State the assumption explicitly in the deliverable (the PR body, the
   report, the handover) so a wrong guess is caught at review rather than in production. Do not bury it.

### Pre-mortem for the unknown column

You cannot rank an assumption you never wrote down. Two prompts reliably surface the missed ones:

- **"The user rejects this work. Why?"** Answer it three times with three different reasons. Each reason is
  an assumption; add it to the ledger and route it.
- **"What did the request *not* say that I am treating as settled?"** Scope (which files, which callers,
  which environments), constraints (compatibility, public API, performance, security), definition of done
  (tests, docs, migration), and the thing the ticket mentioned in passing that you skimmed.

Then route the new items like the rest. This step is where the "critical detail the agent missed" gets caught.

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
- `ParseHeader` has no callers outside this assembly (verified: Parser.cs:41, Import.cs:88, both updated)
- Public API may not change (given: ticket says "internal refactor only")
- Flagged: production config sets `MaxRetries` and I cannot read it from here; assuming the default of 3.
Defaults: new branch off main, commit message wording.
```

## Re-reflect on contradiction

Mid-task, something you read contradicts a ledger line. The reflex is to reconcile it quietly and continue.
Instead: stop, mark the line broken, and re-rank. A broken low-load line is a one-line update. A broken
high-load line means the plan built on it is suspect; the deliverable may be useless, and the honest move is
to say so and re-route, which may mean asking now what you correctly did not ask before.
[`walk-the-dog`](../walk-the-dog/SKILL.md) names the broken-assumption case `ESCALATE` for a subagent; the
same rule applies to you.

## Are we still going the right way?

Assumptions are not the only thing that drifts. Agents drift into **solving a peculiarity**: a flaky test, a
build quirk, a library edge case, an environment mismatch. Each step is locally reasonable, and after twenty
of them the session is deep in a problem that the bigger picture never needed solved. The objective did not
change; the agent's attention did.

At every checkpoint, and whenever the last several steps were all about one obstacle, ask three questions:

1. **What is the objective, in the user's words?** Quote it. If you cannot, that is the first finding.
2. **Does the thing I am working on now sit on the path to it?** Name the link. "The tests must pass" is a
   link. "This one test is flaky on CI for reasons unrelated to my change" is not.
3. **Would the user rather have the objective with this worked around, or wait for this solved?** For a
   peculiarity, the answer is nearly always the workaround.

### Token-box the obstacle

When an obstacle is off the path, or its relevance is unclear, give it a budget before you continue:
a fixed number of attempts, or a rough token spend, stated in one line. When the box is spent and the obstacle
is not solved, **stop solving it and work around it**: skip the flaky test with a note, pin the version, stub
the environment, narrow the scope, or ship without the piece and flag it. Record the obstacle in the deliverable
as an open item with what was tried, so it is not lost. Then return to the objective.

The box exists because the sunk cost of twenty steps is what keeps an agent on step twenty-one. The
decision to stop is made when the box is set, not when it is spent.

### Push back

Reflection sometimes shows the request itself is the wrong move: the premise is false, the constraint given
conflicts with the code, the fix asked for treats a symptom, or the objective is cheaper to reach another
way. Say so, in two sentences, before doing the work: what you found, and what you recommend instead. Then do
one of two things. If the user is present, wait for their answer; that is a route 4 question with a
recommendation attached. If nobody is there to answer, do what was asked and put the pushback at the top of
the deliverable, so the reader sees the concern before the diff.

Pushback is not refusal and not re-litigation. Once the user has heard the concern and confirmed the request,
it is their decision; proceed in full and do not raise it again.

## `reflect deep`

For load-bearing work (a public API, a migration, a security-sensitive change, anything
[`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) would take), the author of a plan is the worst person to
find its unstated assumptions. Spawn a fresh subagent that never saw the reasoning, hand it only the request
and the plan, and ask it for the ledger: what is inferred, what is high-load, what the pre-mortem turns up.
Merge its findings into yours. This is the [`code-review-grill`](../code-review-grill/SKILL.md) stance applied
to a plan instead of a diff. Optional, not the default.

## Anti-patterns

- **Asking what a grep would answer.** Step 1 exists to stop it.
- **Ranking by confidence.** "I'm fairly sure" is not a status. Load is.
- **Filling the ledger only with things you already checked.** The inferred column has to contain the
  embarrassing ones, or it is theatre.
- **Emitting a twelve-line ledger for a typo fix.** Proportionality is part of the skill.
- **Reconciling a contradiction silently.** A broken assumption is news; report it as news.
- **Paraphrasing a given.** Quote the constraint. Paraphrase is where "do not change the public API" turns
  into "keep it mostly compatible".
- **Solving a peculiarity.** Twenty reasonable steps into an obstacle the objective never required. The box
  should have been set at step one.
- **Swallowing a wrong premise.** If the request rests on something false, say so before building on it.
- **Treating "the user said just do it" as permission to stop reflecting.** `whatever`'s escalation signal
  lowers the asking threshold (route 4), not the looking threshold (route 1). Routes 1, 2 and 5 still run.

## Relationship to sibling skills

- [`whatever`](../whatever/SKILL.md): the rule for the low-load bucket. `reflect` decides which items are in
  that bucket; `whatever` handles them.
- [`fact-check`](../fact-check/SKILL.md): the tool for grounding one item.
- [`triage`](../triage/SKILL.md) READINESS and [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md) grilled
  requirements: the same check at the ticket level, before work starts. `reflect` is the moment-to-moment
  version inside a task.
- [`manager`](../manager/SKILL.md): verdicts on someone else's asks. `reflect` is about your own.
