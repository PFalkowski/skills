---
name: handoff
description: 'Produce a minimal, lossless handover note — ordered action points plus only the state the receiver cannot reconstruct — to carry work across a context boundary. Every line must change what the receiver does next: point at files instead of pasting, carry state not story, resolve every reference. Use when work must move to a fresh session, another agent or model, a subagent, or survive /clear or /compact — when the user says "hand this off", "write a handover", "continue in a new session", "I am switching models", "wrap up before you clear or compact", or context is about to reset mid-task. handoff-check decides whether to hand off; this writes the handover.'
---

# handoff

The receiver shares **none** of your context — only what you write down. Carry the
least text that lets them act without re-asking: ordered action points, plus the state
they cannot reconstruct from the repo. Nothing else. A good handoff fits on one screen.

## The note

Write these sections. **Omit any that would be empty — a heading with nothing under it is noise.**

Core (almost always):
- **Goal** — one line: the destination, and why it matters.
- **Next** — the action points, ordered, imperative. The first is what to do *now*.
  This is the payload; every other section just supports it.
- **Done when** — how the receiver knows it is finished (acceptance criteria).

Add only when it changes what they do:
- **Settled** — decisions made, constraints, and dead-ends ruled out — so they neither
  re-litigate nor re-explore what you already closed.
- **Map** — key files, entry points, commands, PR/issue numbers. Paths, not prose.
- **Watch out** — non-obvious gotchas / tacit knowledge that cost you to learn and would
  cost them to rediscover.

## The discipline (the point of this skill)

1. **Earn every line.** If deleting it would not change the receiver's next move, cut it.
   When unsure, cut.
2. **Point, don't paste.** They have the repo, the PR, the diff — reference by path or
   number; never reproduce contents.
3. **State, not story.** Carry where things *are*, not the journey there. No history, no
   narration of failed attempts — except as one-line "ruled out" entries under Settled.
4. **One fact, one place.** Do not restate the goal in three sections.
5. **Resolve every reference.** No "it", "that file", "the thing we discussed" — absolute
   paths, real names, runnable commands. They cannot see your screen.

If the state cannot be compressed into a short note without losing hard-won
understanding, say so — the work may be too entangled to hand off cleanly (prefer
`/compact` or staying put).

## Deliver it to the channel

- **Fresh session / `/clear` / `/compact`** → write the note to a file that survives the
  reset (e.g. `HANDOFF.md` in the repo), then give the user the one command to resume.
  Do not clear or compact for them.
- **Subagent now** → the note *is* the spawn prompt.
- **Another agent / model / human** → output the note inline, ready to paste.

## Example

> **Goal** — Make `/export` stream CSV so large reports stop OOMing.
> **Next**
> 1. Replace the buffered write in `api/export.py:88` with the row generator in `csv_stream.py`.
> 2. Feed that generator into the `StreamingResponse` (pattern: `api/reports.py:140`).
> 3. Re-run `tests/test_export.py::test_large_export` — currently red.
>
> **Done when** — that test is green and a 1M-row export holds memory flat.
> **Settled** — chunked `StreamingResponse`, not a background job (latency matters).
> Ruled out: pandas `to_csv` (loads every row).
> **Map** — `api/export.py`, `csv_stream.py`, PR #214.

Action points first, paths not pastes, decisions and dead-ends closed — and nothing the
receiver could read off the repo themselves.
