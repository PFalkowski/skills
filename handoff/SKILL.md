---
name: handoff
description: 'Write a lossless handover for a fresh session or agent, including before /clear; lite prints inline.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# handoff

The receiver has none of this conversation. Carry ordered actions and unreconstructable state in roughly one screen.

## Note

Omit empty sections. Usually include:

- **Goal:** destination and why, in one line.
- **Next:** ordered imperative actions, immediate action first.
- **Done when:** acceptance criteria.

Add only if they change the receiver's actions:

- **Settled:** decisions, constraints, and one-line ruled-out approaches.
- **Map:** key absolute paths, entry points, runnable commands, PR/issue numbers.
- **Watch out:** non-obvious, costly-to-rediscover knowledge.

Cut any line that would not change the next move. Reference repo/PR/diff contents instead of copying them. Describe current state, not history; state each fact once. Resolve references explicitly—no “that file” or assumed shared context.

If a short note would lose essential understanding, say so and prefer `/compact` or continuing in place.

## Delivery

- **Fresh session / `/clear` / `/compact`:** write a durable file such as `HANDOFF.md`, then give one resume command. Never clear or compact for the user.
- **Subagent now:** use the note as the spawn prompt.
- **Another agent/model/human, or `lite`:** one paste-ready fenced block.

`/handoff lite`, “quick handover”, “carry this over”, or “context is filling up” force inline delivery: write nothing to disk and clear/compact nothing. If nothing remains open, say so in one line.
