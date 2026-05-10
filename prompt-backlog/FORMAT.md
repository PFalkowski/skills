# prompt-backlog — File format spec

A prompt-backlog file is a Markdown document with a defined structure that is both human-readable and parseable by an agent without a custom parser.

## Design goals

1. **Verbatim prompts.** Each item carries the exact text to feed to the agent — no paraphrasing at execution time.
2. **Greppable status.** A human (or `grep`) should see what's left in one pass: `grep '^## \[pending\]' prompts/*.md`.
3. **Machine-parseable metadata.** YAML blocks per item give a stable structure without forcing the file out of plain Markdown.
4. **Resume-safe.** An agent restarting from cold context should be able to re-read the file and pick up exactly where the previous run stopped.
5. **Editor-friendly.** Plain Markdown — no custom DSL, renders cleanly on GitHub.

## File-level structure

```md
---
title: <Human title for this backlog>
created: <YYYY-MM-DD>
target_agent: <where these prompts will be fed — e.g. "claude-code", "general-purpose subagent", "Opus 4.7">
notes: <optional one-liner, file-level context>
---

# <Title>

<One paragraph: what this backlog accomplishes, why it exists, who it's for.>

## Status legend

- `pending` — not yet started
- `in_progress` — currently executing
- `done` — completed successfully
- `skipped` — intentionally not executed
- `blocked` — needs human input

---

## [pending] 001 — <Imperative title>
...
---

## [pending] 002 — <Imperative title>
...
```

The horizontal rule (`---`) between items is required — it gives parsers a hard boundary and keeps the rendered output scannable.

## Item structure

Each item is exactly five blocks in this order:

### 1. Header

```md
## [<status>] <NNN> — <Short imperative title>
```

- `<status>` is one of the statuses above, in square brackets.
- `<NNN>` is a zero-padded sequence number. Pad to 3 digits unless you know you'll exceed 999.
- The title is a short imperative phrase, like a git commit subject.

### 2. YAML metadata block

```yaml
id: "001"
status: pending
depends_on: []
expected_outcome: <One sentence describing observable success>
```

Fields:

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | Matches `<NNN>` in the header. Quoted to preserve leading zeros. |
| `status` | yes | enum | Must match the bracketed status in the header. Drift = bug. |
| `depends_on` | yes | list of `id` strings | Empty list means "no dependencies, executes after preceding items by position". |
| `expected_outcome` | yes | string | What success looks like — one sentence. |
| `model` | optional | string | If a specific model is required (e.g. `claude-opus-4-7`). |
| `tools` | optional | list of strings | If specific tools must be available (e.g. `[Edit, Bash]`). |

### 3. Prompt block

```md
**Prompt to agent:**

`​`​`​`text
<Verbatim prompt — multi-line OK. The 4-tick fence allows the prompt itself to contain triple-backtick code blocks.>
`​`​`​`
```

- Use a **4-tick fence** so the prompt body can contain ordinary triple-backtick code without escaping.
- The `text` language hint is conventional; renderers won't try to syntax-highlight it.
- Everything between the fences is fed verbatim to the agent. No edits at execution time.

### 4. Human notes (optional but conventional)

```md
**Human notes:**

<Editorial commentary, links, rationale, things future-you needs to know but the agent doesn't.>
```

This block is for humans only. Executors must NOT include it in the prompt sent to the agent.

### 5. Run log

```md
**Run log:**

- 2026-05-10T22:14:03Z — started
- 2026-05-10T22:14:51Z — agent returned: <one-line summary>
- 2026-05-10T22:14:55Z — done
```

Append-only. Timestamps in ISO-8601 UTC. One line per event. Long agent outputs go in a sub-bullet or referenced file, not inline.

## Parsing recipe (for executors)

A minimal parser:

1. Strip the YAML frontmatter (between the first two `---` lines).
2. Split the body by `\n---\n` boundaries.
3. For each section starting with `## [`:
   - Extract status from the bracket, id from the `NNN`, title from the rest of the header line.
   - Find the first ` ```yaml ` ... ` ``` ` block — parse as YAML for the metadata.
   - Find the first ` ````text ` ... ` ```` ` block — that's the verbatim prompt.
   - Everything else is human notes + run log.
4. Pick the first item where `status == pending` and all `depends_on` are `done`.

Regex for the header: `^## \[(\w+)\] (\d+) — (.+)$`.

## Status drift — header vs YAML

The status appears in two places (header and YAML). This is intentional duplication for greppability, but it means they can drift. The rule:

- When updating status, update **both** in the same edit.
- An executor encountering drift should treat the YAML as authoritative (it's structured) but log a warning to the run log.

## Resume semantics

An agent restarting cold:

1. Reads the whole file.
2. Finds the first `[in_progress]` item, if any. Treat its run log as the resume point — re-feed the prompt only if the run log shows no agent response yet.
3. If no `[in_progress]`, picks the first `[pending]` whose `depends_on` are satisfied.
4. Never silently downgrades `[in_progress]` → `[pending]` without logging it as a recovery.

## Versioning

This format is v1. If/when it evolves, add a `format_version: 2` field to the file-level frontmatter and bump this spec. Backlogs without `format_version` are assumed v1.
