---
name: prompt-backlog
description: Define and execute an ordered, verbatim queue of prompts for an agent. A prompt-backlog file lists prompts (not work items) that should be fed to an agent in sequence — useful for repeatable playbooks, multi-step refactors, onboarding scripts, or any flow where the exact wording of each prompt matters. Use when the user says "prompt backlog", "prompt queue", "agent script", "prompts to feed in order", "playbook of prompts", or invokes /prompt-backlog. Includes init for the `prompts/` folder convention.
---

# prompt-backlog

A **prompt backlog** is an ordered, machine-parseable file of prompts intended to be fed to an agent verbatim, one after another. Distinct from a *work-item* backlog (see `nightshift`): items here carry the literal prompt text, not acceptance criteria.

## When to use

- Reproducible multi-prompt playbooks (e.g. "set up a new repo", "migrate from X to Y", "perform a release").
- Hand-off from a senior author to an autonomous executor where the *exact wording* of each prompt is the work.
- Long flows where you want the agent to resume cleanly after a context reset.

## When NOT to use

- One-off conversational tasks → just talk to the agent.
- Work items with acceptance criteria (TDD, bugs, features) → use `nightshift`.
- Architectural plans → use ADRs + `to-issues`.

## Convention — folder layout

```
<repo-root>/
├── prompts/                # the canonical location
│   ├── INDEX.md            # optional — lists backlogs in suggested order
│   ├── 01-<slug>.md        # individual backlog file
│   └── 02-<slug>.md
└── ...
```

Single-file repos may put one `prompts/backlog.md` at the root. The `prompts/` folder is the convention — don't scatter backlog files elsewhere.

## Init — bootstrap the folder + a starter file

When the user asks to "set up a prompt backlog" / "initialize prompts" / runs this skill in a repo with no `prompts/` folder:

1. Create `prompts/` at the repo root.
2. Copy [TEMPLATE.md](TEMPLATE.md) to `prompts/<slug>.md` (slug from the user, default `backlog`).
3. Fill in the frontmatter (`title`, `created` to today, `target_agent`).
4. Leave one example item in `[pending]` state for the user to edit.
5. Confirm the path back to the user.

PowerShell one-liner (Windows):
```powershell
New-Item -ItemType Directory -Path 'prompts' -Force | Out-Null
Copy-Item "$env:USERPROFILE\.claude\skills\prompt-backlog\TEMPLATE.md" 'prompts\backlog.md'
```

POSIX:
```bash
mkdir -p prompts && cp ~/.claude/skills/prompt-backlog/TEMPLATE.md prompts/backlog.md
```

## File format (high level)

Each backlog file has:
- A YAML frontmatter block (file-level metadata).
- A `# Title` and one-paragraph context.
- A status legend (copied verbatim — see TEMPLATE).
- N items, each:
  - `## [<status>] <NNN> — <imperative title>`
  - A YAML metadata block (id, status, depends_on, expected_outcome).
  - **Prompt to agent:** verbatim prompt inside a 4-tick fence.
  - **Human notes:** editorial commentary the agent ignores.
  - **Run log:** appended by the executor.

Full spec with rationale: see [FORMAT.md](FORMAT.md). Copy-paste starter: see [TEMPLATE.md](TEMPLATE.md).

## Execution model

```
1. Open the backlog file. Find first item where status == pending and depends_on are all done.
2. Flip [pending] → [in_progress] in both the header and the YAML block. Append "started: <ISO>" to Run log.
3. Feed the **Prompt to agent** block verbatim to the executing agent. Do NOT include Human notes.
4. Capture the agent's response (or a summary, if very long) into Run log.
5. Decide outcome:
   - Success → flip to [done], append "done: <ISO>".
   - Cannot proceed (missing input, ambiguous) → flip to [blocked], append "blocked: <reason>".
   - Skip on purpose → flip to [skipped] with a reason.
6. Move to the next eligible item.
```

The status-in-the-header (`[pending]`) is intentional duplication of the YAML — it makes greppable what's left and lets a human eyeball progress in one scroll. Keep them in sync.

## Statuses

| Status | Meaning |
|---|---|
| `pending` | Not yet started. |
| `in_progress` | Currently executing. Should be at most one at a time per backlog. |
| `done` | Completed successfully. |
| `skipped` | Intentionally not executed (with reason). |
| `blocked` | Cannot proceed; needs human input. |

## Anti-patterns

- **Don't paraphrase the prompt at execution time.** The verbatim prompt is the contract; if it's wrong, edit the file, don't reinterpret it.
- **Don't merge prompt + acceptance into one item.** That's `nightshift`'s job.
- **Don't scatter backlogs across the repo.** Use `prompts/` so future-you and other agents know where to look.
- **Don't forget to flip status.** Header `[pending]` and YAML `status: pending` must stay in sync — drift makes resume after a context reset unreliable.
