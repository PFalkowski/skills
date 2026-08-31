---
name: guide-me-through
description: 'Turns "guide me through X" into a committed runbook at docs/runbooks/<slug>.md plus a short chat walk-through, each step marked You (only the user can do it) or Assistant (done once the user reports back). Triggers: "guide me through", "walk me through", "how do I do X step by step", any procedure touching accounts, consoles, payments or hardware.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# guide-me-through

A walk-through typed into chat evaporates: the user follows it with a browser or a console
open, not the conversation, and comes back later with results. Half the steps are theirs
(accounts, credit cards, SSH keys, physical hardware) and half are the assistant's to run once
they report back. So the durable artifact is a runbook file in the project; the chat is the
pointer to it.

## The runbook

Write `docs/runbooks/<slug>.md` in the project repository (create the directory; kebab-case
slug of the procedure), then commit it before walking the user through it. Sections:

- **Purpose** — one line: what following this achieves, and what it does not.
- **Prerequisites** — what must exist first, with the cheapest way to check each.
- **Steps**, numbered, each marked **You** (only the user can do it) or **Assistant** (run once
  the user reports back). Every **You** step names exactly what to report back — an IP, a
  version string, a digest, a confirmation. Commands are copy-pasteable and name their shell.
  Values the user supplies are `<placeholders>`.
- **Stop the meter** — the cleanup step for anything that bills, stays running, or leaves
  keys behind. Say which action actually stops the cost (destroy versus power off).
- **What this measures and what it does not** — the scope, so the result is not overread.

## Rules

- Verify facts about the outside world (prices, flags, console flows, URLs) before writing
  them; they drift faster than the repository. Put the date and the sources in the runbook.
- If the procedure needs a small enabling change in the code (a host variable, a flag), make
  it, test it, commit it, and reference it — never hand over a runbook that assumes code that
  does not exist yet.
- Keep the chat walk-through short and point at the file; when the user reports back, continue
  from the runbook and fold every correction learned into it. The file is the source of truth.
- One file per procedure; re-running a procedure later starts from its runbook, not from memory.
