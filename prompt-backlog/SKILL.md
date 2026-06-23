---
name: prompt-backlog
description: 'A dead-simple, ordered list of prompts to feed to an agent verbatim, with a status header and a log per item. Use when the user says "prompt backlog", "prompt queue", "agent script", "prompts to feed in order", "playbook of prompts", or invokes /prompt-backlog. Includes init for the `prompts/` folder convention.'
---

# prompt-backlog

The user's verbatim prompt is the payload; status + log are one line of overhead each.

## File shape

```md
# <Backlog title>

## [pending] First task title

`​`​`
Verbatim prompt. Multi-line OK. Fed to the agent exactly as written.
`​`​`

Log:
- <append events here>

---

## [pending] Second task title
...
```

That's the whole format. Three things per item:

1. **Header** — `## [<status>] <title>`. Status is one of: `pending`, `in_progress`, `done`, `skipped`, `blocked`.
2. **Prompt** — a fenced code block. Use a 4-tick fence (` ```` `) only if your prompt itself contains triple-backticks.
3. **Log** — a `Log:` line followed by bullet events. Append-only.

Items are separated by `---`.

Copy-paste starter: [TEMPLATE.md](TEMPLATE.md).

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

Then open `prompts/backlog.md` and replace the example with real prompts.

## Execution

```
1. Find the first item where status == pending.
2. Flip [pending] → [in_progress] in the header. Append "started <date>" to Log.
3. Feed the fenced prompt to the agent verbatim.
4. Append a Log line with the outcome.
5. Flip header to [done] / [blocked] / [skipped] as appropriate.
6. Move to the next pending item.
```

## Statuses

`pending` → not started · `in_progress` → running · `done` → finished · `skipped` → intentionally not run · `blocked` → needs human input

## Anti-patterns

- **Don't paraphrase the prompt at execution time.** If the prompt is wrong, edit the file.
- **Don't add metadata you don't need.** This format intentionally has no IDs, no `depends_on`, no `expected_outcome`. Order is positional. Add a one-line note in the prompt itself if you need extra context.
- **Don't merge prompt + acceptance criteria into one item.** That's `nightshift`'s job.
