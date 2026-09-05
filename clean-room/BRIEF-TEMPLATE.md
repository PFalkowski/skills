# Clean-room brief — <what this is for>

> The airlock. This is the **only** artefact that crosses from the study pass to
> the build pass. Written by someone who read the source; read by someone who
> never will.
>
> Delete this quote block and every `<…>` placeholder before screening.
>
> Rule of thumb while writing: **describe what a caller observes and why each
> decision exists. Never describe how it was built.** A brief that is too thin
> costs the build pass an hour. A brief that is too rich costs you the clean
> room.

- Run: `<yyyy-mm-dd>-<slug>` · Tier: `<B | C>` · Screened: `<not yet>`
- Written without reference to: `<the clean repository — the study pass never opened it>`

---

## Goal

<One paragraph. What must be true when this is done, stated as observable
behaviour. Copy this from `preflight.md` — if it has changed, say so and say
why, because a goal that drifted during the study pass is the first symptom of
goal-shaped-by-source.>

## Behaviour

<The externally visible contract. Inputs, outputs, ordering, units, ranges,
identity/equality, idempotency, what happens on each error class.

Write it as if specifying an API you are about to publish. If a sentence could
only have been written by someone holding the source, cut it.>

| Input | Output | Notes |
|---|---|---|
| | | |

## Decisions and their reasons

<The most valuable section, and the safest: reasons carry no expression.

For each non-obvious choice — a cap, a floor, a threshold, an ordering, a
retry class, a fallback — record **what the choice is** and **what failure it
exists to prevent**. "There is a ceiling on this component so a single extreme
input cannot saturate the total" is exactly right. "It is capped at 70 in
`_risk-config.ts`" is not.>

| Decision | Why it exists |
|---|---|

## Edge cases and failure modes

<What goes wrong, and what the correct response is. Distinguish an empty
result from a failed read wherever the distinction is observable — collapsing
them is the most commonly re-derived bug in this class of work.>

## Acceptance criteria

<Sentences a test could assert, written before any test exists. One per line.
These are what the build pass will turn into its own tests, in its own
vocabulary.>

- [ ] <Given … when … then …>
- [ ] <Given … when … then …>

## Data and primary sources

<Where the build pass should go for facts — the upstream authority, not the
studied source. Tier C material belongs here as *pointers*, never as copied
tables.>

| What | Primary source | Licence / terms |
|---|---|---|

## Open questions for the build pass

<Everything you could not answer, or deliberately left to the builder's own
judgement. Be generous here: an incidental choice made independently is a
feature of the process, not a gap in the brief.>

## Deliberately not carried across

<What you saw and chose not to describe, and why. This section is short and it
is the one an auditor reads first — it is evidence that the boundary was
applied on purpose rather than by luck.>

---

## Screen record

<Filled in after `node screen-brief.mjs` runs. Paste the output line — the
counts are what show the screen examined something.>

```
<screen output>
```

Human read completed by: `<who>` on `<date>`. Judgement questions answered:

- Does any sentence describe construction rather than behaviour? `<no / fixed at …>`
- Could a reader reconstruct their layout, names, or call graph? `<no>`
- Is there a passage I could not have written from the outside? `<no / cut>`
