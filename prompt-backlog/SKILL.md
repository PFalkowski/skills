---
name: prompt-backlog
description: 'Queue deferred work or reminders as ordered prompts ready for a fresh agent.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# prompt-backlog

Capture deferred work while context is live as ordered, self-contained prompts. Do immediate work directly; capture “next”, “later”, “remember”, and queued follow-ups here.

Use one file per backlog at `<repo-root>/prompts/<slug>.md`. Starter: [TEMPLATE.md](TEMPLATE.md).

## Item schema

Separate items with `---`. Each has exactly:

1. `## [<status>] [<priority>] <title>`.
2. **Context** (captured date): a short paragraph naming the situation, requester, why, files/decisions/constraints, and definition of done.
3. **Prompt:** a fenced block authored now, runnable verbatim by a fresh agent without this session. Include paths, goal, decisions, and constraints. Use four backticks if it contains triple-backtick fences.
4. `Log:` followed by append-only dated events, starting with `created <date>`.

Do not merely store raw user wording. If a standalone prompt cannot yet be written, record what is missing in Context and mark `blocked`. Add no IDs, dependencies, or extra fields; put nuance in Context. This is a prompt queue, not `nightshift`'s executable prompt-plus-acceptance TDD specification.

| Priority | Meaning/signals |
|---|---|
| `P0` | Next: “do this next”, urgent follow-up |
| `P1` | Soon: “after this is merged”, near-term |
| `P2` | Later; default without a signal |
| `P3` | Someday: “keep in mind”, nice-to-have |

Statuses: `pending` (unstarted), `in_progress`, `done`, `skipped` (intentionally not run), `blocked` (needs human input).

## Initialize

If asked to set up a backlog and `prompts/` is absent:

```powershell
New-Item -ItemType Directory -Path 'prompts' -Force | Out-Null
Copy-Item "$env:USERPROFILE\.claude\skills\prompt-backlog\TEMPLATE.md" 'prompts\backlog.md'
```

POSIX:

```bash
mkdir -p prompts && cp ~/.claude/skills/prompt-backlog/TEMPLATE.md prompts/backlog.md
```

Replace template examples with actual items.

## Execute

1. Pick the highest-priority `pending` item (P0 first), breaking ties by file order.
2. Mark `in_progress`; append `started <date>`.
3. Give the agent the fenced prompt **verbatim**. Context is for humans/triage unless deliberately included. Correct a wrong prompt in the file; do not paraphrase at execution.
4. Append the outcome and mark `done`, `blocked`, or `skipped`.
5. Repeat.
