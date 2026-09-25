---
name: go-go-go
description: 'Drives the repo from its current state — uncommitted work, open tasks, a stalled PR — to a raised, reviewed PR without stopping for low-stakes decisions. Triggers: "go go go", "just ship it", "make it happen", "finish and PR this".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# go-go-go

**Invoked by an agent rather than typed by a human?** Run [`reflect`](../reflect/SKILL.md) first — surface and route load-bearing assumptions before whatever-mode starts deciding on your behalf.

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

1. **Single small item** (≤ 1 task, clearly spec'd) → implement inline in this session using TDD (red → green → refactor).

2. **Multiple items or overnight scope** → invoke `nightshift` (skip re-doing pre-flight if acceptance criteria are already clear; tell it to go directly to Phase 2 with "go" already given).

3. **Single well-defined goal with no backlog file** → loop with a focused subagent (Agent tool, Explore or claude subagent type per task) until done. Budget 3–10 tool calls for simple, 10–20 for moderate.

Do not over-spawn. One subagent per independent slice; collapse sequences into a single agent.

## Step 4 — Commit (State B)

Stage and commit changed files. Rules:

- Stage specific files by name — never `git add .` blindly (may catch secrets or binaries).
- If there are untracked files that look like generated artifacts (`.obj`, `.bin`, build output) → skip them; if they look like source → stage them.
- Commit message: imperative, ≤72 chars subject, one blank line, brief body if context is non-obvious.

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

## Step 6 — Review & triage the PR (ALWAYS, once it's raised)

Drive every fresh PR through review and triage **before** the final report — don't wait to be asked:

1. **Adversarial review.** Invoke **`code-review-grill`** on the new PR — a *fresh* agent that did not write the diff (never self-review from the session that wrote it). Scale to the change: a single reviewer for small/contained diffs, quorum (concern-per-agent) for load-bearing ones; models per § Model selection below. Within go-go-go, code-review-grill's own Step 7 ask-before-posting gate is skipped — go-go-go's whatever-mode already covers that decision — but its posting *mechanics* and its posting bar ([REFERENCE, § The bar](../code-review-grill/REFERENCE.md#the-bar--what-may-be-posted-inline-or-fixed-in-this-pr)) still apply: real inline per-finding PR comments for the 🔥/⚠️ findings (one thread first, confirm it landed, then the rest), plus the one summary thread.
2. **Auto-apply the mechanical findings on changed lines** (typo, import, lint, formatting; the list in [§ The bar](../code-review-grill/REFERENCE.md#the-bar--what-may-be-posted-inline-or-fixed-in-this-pr)) and push. A 🔥/⚠️ you also fix under whatever-mode is still posted in step 3, marked fixed.
3. **Post every 🔥/⚠️ finding on a diff line as its own inline PR comment, fixed or not**; an off-diff one goes in the summary thread's Off-diff blockers. Each comment body states its status (fixed in commit `<sha>`, or left unresolved) plus the finding's description, suggested fix, and verification. Then file the Carried class issues, one per defect shape, a security or data-loss one at blocker priority and named in the final report; then the summary thread (REFERENCE, § The bar) linking them.
4. **Triage next steps into issues.** Convert deferred / out-of-scope work into tracker issues via **`to-issues`** (or `gh issue create`), linked from the PR, so nothing falls through.

Spawn the fresh reviewer even when the change "looks clean."

## Step 7 — Unblock a stalled PR (State D)

Diagnose why the PR is stalled, then fix:

| Stall reason | Action |
|---|---|
| CI failing | Read the failing check, fix root cause, push |
| Review comments | Address each comment; push; re-request review |
| Merge conflicts | Rebase onto base, force-with-lease, push |
| Awaiting approval | Post a summary comment nudging the reviewer; don't spam |
| Ready to merge | `gh pr merge --squash --delete-branch` (only if user authorized auto-merge) |

## Step 8 — Report

One short paragraph: what state you found, what you did, the PR URL, the review outcome (findings auto-fixed vs left as unresolved PR comments), any issues filed, and what (if anything) still needs human action. No rehashing every step — just the outcome and the links.

## Model selection

Workers run on the house worker tier set in `CLAUDE.md`: low effort for discovery, mechanical code and commit messages, medium for implementation. Review and hard design run on the strongest tier available. The lead (this session) stays on its current model for synthesis. [save-tokens](../save-tokens/SKILL.md) owns the rubric.

## Extreme mode (at own discretion)

When normal go-go-go stalls — the goal is still unmet after the standard pass, the task is large, or the work is iterative by nature — escalate to the built-in **`/goal`** as the persistence engine.

### When to self-escalate to extreme

Trigger extreme mode autonomously when any of these hold:
- The goal is not reached after one full A→D pass and there are still pending items.
- The task is explicitly long-running, iterative, or "keep going until done".
- CI keeps failing in a loop and fix-attempt count > 2.
- The task has more than ~5 independent slices that benefit from parallel attack.

### How to pick the agent shape (own discretion)

Classify the remaining work on two axes: **breadth** (how many independent slices?) and **depth** (does each slice need hard reasoning?):

| Shape | When to use | Model |
|---|---|---|
| **Farm — parallel workers** | Many independent, mechanical slices (rename, boilerplate, test scaffolding, bulk file edits, format passes) | house worker tier at low effort, all in parallel |
| **Chain — sequential steps** | Single complex goal that requires each step to reason about the last (design, architecture, security, intricate refactor) | strongest tier available, sequential |
| **Mixed** | Some slices mechanical, some hard | a farm for the mechanical slices in parallel, a chain for the hard nucleus |

Default to **Farm** unless depth clearly demands otherwise.

### `/goal` integration

`/goal` is a built-in command the agent cannot run itself. Give the user the line to type, with the goal as one exit condition the transcript can prove and a turn cap:

```
/goal all backlog items are done, CI is green, and a PR is open, or stop after 10 turns
```

Suggest auto mode with it, so goal turns run without permission prompts. With nobody at the keyboard, launch it headless from the repo instead: `claude -p "/goal <condition>" --output-format stream-json --verbose`. That session starts empty, so the condition carries a [`handoff lite`](../handoff/SKILL.md) brief. Each turn re-reads state (git, CI, backlog), spawns workers per the chosen shape, and commits progress. Keep the cap at **10** turns unless the user raised it.

### Farm worker brief template

```
Objective: <one sentence, one file/module/task>
Output: commit the change; output "DONE: <what you did>" or "BLOCKED: <reason>"
Tools: [Edit, Bash (tests only), Read]
Out of scope: everything not in Objective
```

### Chain step brief template

```
Objective: <this step's outcome>
Prior step output: <paste prior step's summary>
Output: implement + commit; summarize in ≤3 sentences for the next step
Tools: [all]
```

## Stop conditions

Stop and ask **only** when:

1. No secrets/credentials are available and the task cannot proceed without them.
2. The task would require a force-push to a shared protected branch.
3. A hard design fork exists where guessing wrong would require discarding significant real work.
4. The goal hit its turn cap and blockers remain that need human judgment.

In all other cases: decide, report the choice in one line, keep moving.
