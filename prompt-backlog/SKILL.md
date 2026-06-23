---
name: prompt-backlog
description: 'Capture work to do next, later, or keep-in-mind as an ordered, prioritized backlog of ready-to-run prompts — each tagged with the context and the reason it was requested. Use whenever the user defers or plans work: "do this next", "later", "after this", "remind me to", "keep in mind for later", "note for later", "add to the backlog", "queue this up", "we should ... at some point", "follow-up", plus the explicit "prompt backlog", "prompt queue", "agent script", "playbook of prompts", or /prompt-backlog. When adding an item, the agent writes a self-contained prompt from the CURRENT context that a fresh agent could run verbatim to achieve it, plus a Context note: what was happening, who asked, and why. Includes the prompts/ folder convention and init.'
---

# prompt-backlog

A prioritized, ordered list of deferred work. Each item carries three things: **why** it was
asked (Context), **what to do** (a ready-to-run prompt), and a running **Log**.

The key move: **the prompt is written now, while the context is live.** Whoever captures the item
has the conversation in context — file paths, decisions, constraints, the reason. A future agent
(or future-you) starting cold will not. So author a *self-contained* prompt that a fresh agent
could run verbatim, and record the Context that explains the why. Don't just stash the user's
words and hope the situation is still understood later.

## When to capture
Whenever work is deferred rather than done now: the user says to do something next/later/after
this, to keep it in mind, to remember it, to add it to the backlog, or asks to plan/queue
follow-up work. Capture it as an item; don't drop it into the void or rely on it staying in
context. (For work to do *right now*, just do it — this is for *later*.)

## File shape

```md
# <Backlog title>

## [pending] [P1] First task title

**Context** (captured <date>): what we were doing when this came up, who asked, why it matters,
the relevant files/decisions/constraints, and what "done" looks like.

`​`​`
Self-contained, ready-to-run prompt authored now from the live context. It must STAND ALONE:
name the files/paths, repeat the decisions and constraints, state the goal — so a fresh agent
with no memory of this session can run it verbatim and achieve what was asked.
`​`​`

Log:
- created <date>

---

## [pending] [P3] Second task title
...
```

Four parts per item:

1. **Header** — `## [<status>] [<priority>] <title>`. Status ∈ `pending`, `in_progress`, `done`,
   `skipped`, `blocked`. Priority ∈ `P0`–`P3` (below).
2. **Context** — one short paragraph: the situation, who asked, why, constraints, definition of
   done. This is the *why* that the prompt alone can't carry.
3. **Prompt** — a fenced code block, **authored by the capturing agent** from current context,
   self-contained. Use a 4-tick fence (` ```` `) only if the prompt itself contains triple-backticks.
4. **Log** — a `Log:` line followed by append-only bullet events.

Items are separated by `---`.

Copy-paste starter: [TEMPLATE.md](TEMPLATE.md).

## Priority

| Tag | Meaning | Typical trigger |
|---|---|---|
| `P0` | do next | "do this next", "first thing after this", urgent follow-up |
| `P1` | soon | "soon", "after this is merged", near-term |
| `P2` | later (default) | "later", "at some point", general backlog |
| `P3` | someday / keep in mind | "keep in mind", "note for later", nice-to-have |

If the user gives no signal, default to `P2`. The temporal words map to priority — that's how
"next" vs "keep in mind for later" gets encoded.

## Convention — folder layout

```
<repo-root>/prompts/<slug>.md
```

Single file per backlog, under `prompts/` at the repo root. Don't scatter backlogs elsewhere.

## Init

When the user asks to set up a prompt backlog and `prompts/` doesn't exist:

PowerShell (Windows):
```powershell
New-Item -ItemType Directory -Path 'prompts' -Force | Out-Null
Copy-Item "$env:USERPROFILE\.claude\skills\prompt-backlog\TEMPLATE.md" 'prompts\backlog.md'
```

POSIX:
```bash
mkdir -p prompts && cp ~/.claude/skills/prompt-backlog/TEMPLATE.md prompts/backlog.md
```

Then open `prompts/backlog.md` and replace the example with real items.

## Execution

```
1. Among items with status == pending, pick the highest priority (P0 first); break ties by
   file order (top first).
2. Flip [pending] → [in_progress] in the header. Append "started <date>" to Log.
3. Feed the fenced prompt to the agent verbatim. The Context is for the human / for triage —
   it is NOT part of the prompt unless you paste it in deliberately.
4. Append a Log line with the outcome.
5. Flip header to [done] / [blocked] / [skipped] as appropriate.
6. Go back to step 1.
```

## Statuses

`pending` → not started · `in_progress` → running · `done` → finished · `skipped` →
intentionally not run · `blocked` → needs human input

## Anti-patterns

- **Don't stash the user's raw words and move on.** Author the prompt from the live context so it
  stands alone later; if you can't yet, capture what's missing in the Context and mark it `blocked`.
- **Don't paraphrase the prompt at execution time.** If the stored prompt is wrong, edit the file.
- **Don't bloat items.** Priority + Context + prompt + Log is the whole schema — no IDs, no
  `depends_on`, no `expected_outcome`. Put any extra nuance in the Context line.
- **Don't merge prompt + acceptance criteria into one executable item.** That's `nightshift`'s job;
  this is a queue of prompts, not a TDD spec.
