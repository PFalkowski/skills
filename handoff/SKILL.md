---
name: handoff
description: 'Writes a minimal, lossless handover note - ordered action points plus only state the receiver can''t reconstruct - to cross a context boundary. Use for: a fresh session, another agent/model, or /clear or /compact survival; "hand this off", "write a handover", "continue in a new session", "wrap up before you compact". Add `lite` ("quick handover", "carry this over", "context is filling up") to skip the file and emit the note inline as one paste-ready block.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
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
- **Another agent / model / human, or `lite`** → output the note inline as one fenced
  block, ready to paste in one gesture.

`lite` (`/handoff lite`, "quick handover", "carry this over", "context is filling up")
forces the inline route: same note, same discipline, **nothing written to disk**, nothing
cleared or compacted — the user moves the block themselves. If nothing is open, say so in
one line instead of emitting an empty note.

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
