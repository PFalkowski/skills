---
name: wrap-up
description: 'Close a session by shipping work, sweeping scaffolding and handing off what remains.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# wrap-up

Run **ship → sweep → account** so valuable work is preserved, session scaffolding is removed safely, and commitments remain visible.

## Scope

Before acting, state the project repos and this session's branches, worktrees, stashes, and files. Older/other-session work stays untouched unless the user explicitly broadens scope.

## 1. Ship

Inventory each project, including session worktrees:

- Dirty/untracked files: `git status --short`.
- Unpushed commits: `git branch -vv` and `git log @{u}..` per session branch.
- Pushed branches without PRs: `gh pr list --head <branch>` or host equivalent.
- Session-created stashes: `git stash list`.

In a cloud session nothing local survives: parked work, stashes and copied-out logs are lost, so ship or post them, and skip the worktree sweep. Find PRs with `gh api 'repos/{owner}/{repo}/pulls?head=<owner>:<branch>'`, since `gh pr list` fails on GraphQL ([cloud sessions](../docs/cloud-session.md)).

Classify each as **work** (commit → push → PR), **junk** (delete), or **park** (retain for account). Show the full list with recommendations; let the user choose. Each deletion needs its own yes; pushes may be batch-approved. Unattended: ship work, park ambiguity, delete nothing.

## 2. Sweep

Run only after shipping leaves nothing outstanding in scope.

- Leave a worktree before removing it, and remove it from the main checkout. In a session the harness isolated, exit with `ExitWorktree` `keep` first. Run each removal and branch deletion as `git -C <main checkout> …` while the shell stands in the main checkout, never inside the tree being removed: removing the folder the shell stands in makes the next command fail. Start later work from the main checkout too: create the new worktree there, then enter it. A removed worktree does not make the session stale; its commits are in the base.
- Remove clean session worktrees only after their branch is pushed/merged: `git worktree remove <path>`, then `git worktree prune`. Dirty trees return to ship; never force. Include empty leftover directories under the worktrees root.
- Removing a clean, merged worktree is routine and never waits for the human, even when its submodules were initialized. Git refuses a plain removal then, and `--force` is denied, so: confirm `git -C <wt> status --porcelain` and `git -C <wt> submodule foreach --quiet --recursive 'git stash list; git log --oneline --all --not --remotes'` both print nothing (the removal deletes submodule commits and stashes for good, so any output is a dirty worktree and escalates); delete the worktree's private submodule clones at `$(git -C <wt> rev-parse --path-format=absolute --git-dir)/modules` (git may name the admin folder differently from the worktree); replace each initialized submodule folder in the worktree with an empty folder; then run a plain `git worktree remove` and delete the branch. A dirty or unmerged worktree still escalates.
- First inspect `git status --short --ignored`. Copy out unique logs/evidence/experiment output the session relied on and verify counts before removal; otherwise retain the tree.
- Delete landed local branches with `git branch -d`, never `-D`. Unmerged-branch deletion requires the user's explicit decision.
- Run `git fetch --prune` for stale remote-tracking refs.
- Retain any branch/worktree referenced by an open account item and explain why.

All deletions still require per-item approval, except under [`CLAUDE_AUTONOMY`](../templates/autonomy.md#the-autonomy-flag)`=autonomous`: a clean worktree whose branch has merged, and that merged local branch, are removed without asking, because their commits are in the base. Never force-push.

## 3. Account

Re-read the conversation for requested tasks, promises, future work, and parked items. Count an item done only with transcript verification/command output, not an assertion. Order by user priority, otherwise blockers first.

Use both routes as needed:

- **Tracker:** find the project's existing board from CLAUDE.md, remote, or issues. Draft one issue per item with title, stranger-readable context, and one acceptance line meeting [triage readiness](../triage/READINESS.md). Show drafts, obtain yes, then post. Propose this when several independent threads or more than a screen of items exceed one fresh context. Unattended posting is allowed only when house rules name the tracker.
- **Handoff:** whenever anything remains open, invoke `handoff lite`: one paste-ready inline block, nothing written to disk, including in unattended logs. If issues were filed, Next names one thread to resume plus issue numbers, not copied issue bodies.

### Skill feedback

A misfiring skill, correction, or user feedback is an open item for https://github.com/PFalkowski/skills. Show the draft/diff before outward action:

- Default: issue naming the skill, observed/desired behavior, and verbatim user feedback.
- If the user authors/contributes to that repo: generalized canonical-source edit and PR instead, following `evolve-skill`; strip private specifics.

### Memory

Review touched memory: leave confirmed entries; update/delete contradicted ones; record durable lessons absent from repo docs using house rules (one fact per entry, rationale, application, index). Memory holds standing knowledge, not the session narrative.

If everything shipped, nothing needs sweeping, and the ledger is clear, report that in one line.

When the next task is unrelated to this session's work, end the report with one line suggesting `/handoff lite`, then `/clear`, per [save-tokens](../save-tokens/SKILL.md). A suggestion only: the user may continue here.
