---
name: go-go-go
description: 'End-to-end "ship it" driver — takes whatever state the repo is in (ideas, uncommitted work, open tasks, stalled PR) and drives forward to a raised PR without stopping for low-stakes decisions. Applies whatever-mode, completes unfinished work via nightshift or a focused loop, picks the cheapest model tier that fits each step, commits, pushes, and opens the PR. Escalates autonomously to extreme mode when needed: ralph-loop as persistence engine with either a farm of parallel Haiku workers (mechanical/breadth tasks) or a sequential Opus chain (hard reasoning/depth tasks) — shape chosen at own discretion. Use when the user says "go go go", "just ship it", "make it happen", "finish and PR this", or wants zero-friction end-to-end delivery.'
---

# go-go-go

*"Don't ask, just ship."*

Drive the repo from its current state — uncommitted changes, open tasks, stalled branch, or raw idea — straight to a raised PR. No permission-asking on reversible choices. Stop only at hard blockers (irreversible actions, missing secrets, genuinely ambiguous requirements that would waste real work if guessed wrong).

## Step 1 — Take stock (read-only, fast)

Run in parallel:

- `git status` + `git diff --stat HEAD` — what's here, what's changed, what's staged
- `git branch --show-current` + `gh pr list --head $(git branch --show-current) 2>/dev/null` — is there already a branch and PR?
- Scan for a backlog file (`backlog.md`, `TODO.md`, `TASKS.md`, `.claude/backlog.md`, `docs/work.md`) — is there unfinished work to implement first?
- Check open tasks in the current conversation or TaskList — anything in-progress?

Classify the state:

| State | Meaning |
|---|---|
| **A — idea/goal only** | Nothing coded yet; work to implement before PR |
| **B — partial / uncommitted work** | Code changes exist, not yet committed |
| **C — committed, no PR** | Branch ahead of base; PR not opened |
| **D — PR open, stalled** | PR exists; needs a push (review response, CI fix, merge) |

Multiple states can be true at once — handle them in order A → B → C → D.

## Step 2 — Apply whatever-mode (for this entire run)

From this point: **decide reversible choices without asking.** Branch name, commit message wording, file layout, step ordering, cleanup scope — pick the sensible default, name it in one line, and keep moving. The only questions left are:

- Force-push / destructive rewrites
- Schema or public API changes with downstream consumers
- Secrets / credentials needed but not present
- Requirements so ambiguous that guessing wrong wastes real work (not just style)

Everything else: decide and report the outcome.

## Step 3 — Complete unfinished work (State A)

If there is a backlog or goal with pending items:

1. **Single small item** (≤ 1 task, clearly spec'd) → implement inline in this session using TDD (red → green → refactor). Cheapest model that can handle the complexity: prefer Haiku-class for mechanical tasks, Sonnet for moderate reasoning, Opus only for genuinely hard design problems.

2. **Multiple items or overnight scope** → invoke `nightshift` (skip re-doing pre-flight if acceptance criteria are already clear; tell it to go directly to Phase 2 with "go" already given). Pass `--model=<cheapest-fit>` per item type.

3. **Single well-defined goal with no backlog file** → loop with a focused subagent (Agent tool, Explore or claude subagent type per task) until done. Budget 3–10 tool calls for simple, 10–20 for moderate.

Do not over-spawn. One subagent per independent slice; collapse sequences into a single agent.

## Step 4 — Commit (State B)

Stage and commit changed files. Rules:

- Stage specific files by name — never `git add .` blindly (may catch secrets or binaries).
- If there are untracked files that look like generated artifacts (`.obj`, `.bin`, build output) → skip them; if they look like source → stage them.
- Commit message: imperative, ≤72 chars subject, one blank line, brief body if context is non-obvious.
- Co-author line: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Step 5 — Push and raise PR (State C)

```
git push -u origin <branch>
gh pr create --title "..." --body "..."
```

PR body template:

```
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] <how to verify this>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Pick the PR title from the branch name / commit subject — don't ask. Keep it under 70 chars.

If the branch is `main`/`master` with no feature branch yet → create one first:
`git checkout -b <slug-from-task-description>` → push that branch → PR to main.

## Step 6 — Unblock a stalled PR (State D)

Diagnose why the PR is stalled, then fix:

| Stall reason | Action |
|---|---|
| CI failing | Read the failing check, fix root cause, push |
| Review comments | Address each comment; push; re-request review |
| Merge conflicts | Rebase onto base, force-with-lease, push |
| Awaiting approval | Post a summary comment nudging the reviewer; don't spam |
| Ready to merge | `gh pr merge --squash --delete-branch` (only if user authorized auto-merge) |

## Step 7 — Report

One short paragraph: what state you found, what you did, what the PR URL is, and what (if anything) still needs human action. No rehashing every step — just the outcome and the link.

## Model selection (minimize cost, preserve quality)

| Task | Default model |
|---|---|
| Read-only discovery (git, grep, file scan) | Haiku / Explore subagent |
| Mechanical code (boilerplate, tests, formatting) | Haiku |
| Moderate implementation (new feature, refactor) | Sonnet |
| Hard design / architecture / security | Opus |
| PR description, commit message | Haiku |

Spawn worker subagents with `model: "haiku"` unless the brief clearly requires stronger reasoning. The lead (this session) stays on its current model for synthesis.

## Extreme mode (at own discretion)

When normal go-go-go stalls — the goal is still unmet after the standard pass, the task is large, or the work is iterative by nature — escalate to **ralph-loop** as the persistence engine.

### When to self-escalate to extreme

Trigger extreme mode autonomously when any of these hold:
- The goal is not reached after one full A→D pass and there are still pending items.
- The task is explicitly long-running, iterative, or "keep going until done".
- CI keeps failing in a loop and fix-attempt count > 2.
- The task has more than ~5 independent slices that benefit from parallel attack.

Do **not** announce it — just escalate and note it in the final report.

### How to pick the agent shape (own discretion)

Classify the remaining work on two axes: **breadth** (how many independent slices?) and **depth** (does each slice need hard reasoning?):

| Shape | When to use | Model |
|---|---|---|
| **Farm — parallel Haiku workers** | Many independent, mechanical slices (rename, boilerplate, test scaffolding, bulk file edits, format passes) | `haiku` per worker, all in parallel, Sonnet lead |
| **Chain — sequential Opus steps** | Single complex goal that requires each step to reason about the last (design, architecture, security, intricate refactor) | `opus` per step, sequential, Opus lead |
| **Mixed** | Some slices mechanical, some hard | Haiku farm for mechanical slices in parallel + Opus chain for the hard nucleus; Sonnet lead synthesizes |

Default to **Farm** (cheap + fast) unless depth clearly demands otherwise. Never pick Opus for a task Haiku can do.

### Ralph-loop integration

Invoke `/ralph-loop` with the goal expressed as a single verifiable exit condition, e.g.:

> "Loop until: all backlog items are `done`, CI is green, and a PR is open. Max iterations: 10."

Pass the agent shape and model constraints in the loop prompt so each iteration spawns the right workers. On each iteration the loop should:
1. Re-read current state (git, CI, backlog).
2. Spawn workers per the chosen shape.
3. Commit progress.
4. Check exit condition — stop if met, otherwise continue.

Cap iterations at **10** unless the user explicitly raised the limit. After the cap, report remaining blockers rather than looping forever.

### Farm worker brief template

Each Haiku worker gets a tight brief:

```
Objective: <one sentence, one file/module/task>
Output: commit the change; output "DONE: <what you did>" or "BLOCKED: <reason>"
Tools: [Edit, Bash (tests only), Read]
Out of scope: everything not in Objective
Model: haiku
```

### Chain step brief template

Each Opus step gets reasoning context from the prior step:

```
Objective: <this step's outcome>
Prior step output: <paste prior step's summary>
Output: implement + commit; summarize in ≤3 sentences for the next step
Tools: [all]
Model: opus
```

## Stop conditions

Stop and ask **only** when:

1. No secrets/credentials are available and the task cannot proceed without them.
2. The task would require a force-push to a shared protected branch.
3. A hard design fork exists where guessing wrong would require discarding significant real work.
4. Ralph-loop hit the iteration cap and blockers remain that need human judgment.

In all other cases: decide, report the choice in one line, keep moving.
