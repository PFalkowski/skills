# Writing agent briefs

A brief is the contract a worker builds from. The issue body and discussion are context; the brief is the spec.

It may sit unclaimed for weeks while the codebase moves underneath it, so write it to survive that.

## Durable, not precise

- **Do** name types, function signatures, config shapes, behavioural contracts.
- **Don't** cite file paths or line numbers. They go stale and send a worker to the wrong place with confidence.
- **Don't** assume today's structure survives.

## Behavioural, not procedural

Say **what** the system should do; the worker explores the code and decides **how**.

- Good: "`SkillConfig` should accept an optional `schedule` field of type `CronExpression`."
- Bad: "Open src/types/skill.ts and add a schedule field on line 42."

## Acceptance the work can fail

Every criterion must be independently checkable, and — this is the one most often missed — **a null result must be
allowed to count as success** where the task is investigative.

A brief that says "find out whether X happens" with no stated handling for "it doesn't" gives the worker no way to
succeed by finding nothing. It will find something. Write the criterion as *"report the count, including
explicitly reporting zero"*, and the failure mode disappears.

## State the scope boundary

Say what is **out** of scope, especially the adjacent thing a reader would assume is included. A brief that scopes
a measurement but not the fix it implies will come back with both.

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one line

**Current behavior:**
What happens now. For a bug, the broken behaviour; for a feature, the status quo it builds on.

**Desired behavior:**
What should happen afterwards, including edge cases and error conditions.

**Key interfaces:**
- `TypeName` — what changes and why
- `functionName()` — what it returns now vs. what it should

**Acceptance criteria:**
- [ ] Independently checkable
- [ ] Including what a null / empty / zero result looks like, if the work is investigative

**Out of scope:**
- The adjacent thing that is a separate decision
- Anything requiring a judgement the worker should not make
```

## Worked example — scoping a brief that mixes work with a decision

A ticket asks: measure whether bad rows affected a published result, decide where to add the guard, and
root-cause how they got in.

Those are three items with different owners. Only the first is agent work — the second is a design decision with
different blast radii, and the third is an investigation that the first one's answer might make unnecessary.

So the brief covers the measurement, states in acceptance criteria that **zero affected rows is a publishable
result**, and lists the other two under out-of-scope with one line each on why they are held back. The reader
learns not just what to do but what someone already decided not to ask for.
