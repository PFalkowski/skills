---
title: <Replace with backlog title>
created: <YYYY-MM-DD>
target_agent: claude-code
notes: <One-liner — file-level context>
---

# <Replace with backlog title>

<One paragraph describing what this backlog accomplishes, why it exists, and who runs it. The agent will read this for context before executing items.>

## Status legend

- `pending` — not yet started
- `in_progress` — currently executing
- `done` — completed successfully
- `skipped` — intentionally not executed
- `blocked` — needs human input

---

## [pending] 001 — Replace with imperative title

```yaml
id: "001"
status: pending
depends_on: []
expected_outcome: One sentence describing what success looks like.
```

**Prompt to agent:**

````text
Replace this with the verbatim prompt to feed to the agent.

Multi-line is fine. Triple-backtick code blocks inside this fence
are also fine because the outer fence uses 4 ticks:

```python
print("hello")
```
````

**Human notes:**

Editorial commentary the agent should not see. Use this for links, rationale,
or context you want future-you to remember but that doesn't belong in the
prompt itself.

**Run log:**

<!-- appended by the executor; one line per event, ISO-8601 UTC -->

---

## [pending] 002 — Replace with imperative title

```yaml
id: "002"
status: pending
depends_on: ["001"]
expected_outcome: One sentence describing what success looks like.
```

**Prompt to agent:**

````text
Verbatim prompt for item 002.
````

**Human notes:**

<!-- optional -->

**Run log:**

<!-- appended by the executor -->

---
