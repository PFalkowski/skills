---
name: merge-stack
description: 'Land a stacked chain of dependent PRs onto its base branch (usually main/master), bottom-up, without hitting the two traps that bite stacked-PR merges. Trap 1 — squash-merging a parent rewrites its commits, so each child phantom-conflicts until rebased onto the freshly-advanced base. Trap 2 — deleting a merged branch auto-CLOSES the next child PR (a closed PR with a deleted base cannot be reopened), so the child must be retargeted to the base first. Use after building a stack of PRs (e.g. a NightShift run) or any time you have PRs where each branch is based on the previous one. Triggers — "merge the stack", "land the chain", "ship the stacked PRs", /merge-stack.'
---

# merge-stack

Land a stacked PR chain (each branch based on the previous) onto the shared base, bottom-up, avoiding the two traps below.

## The two traps
1. **Squash rewrites the parent's commits.** After squash-merging the bottom PR, its commits land as one new SHA; the next child still holds the old commits, so its diff balloons and shared-file edits conflict. → Rebase each child `--onto <base> <old-parent-tip>` before merging.
2. **Deleting a merged branch closes the next child PR.** The host *closes* (not retargets) a PR whose base branch vanished, and a closed PR with a deleted base can't be reopened. → Retarget the next child to `<base>` **before** deleting the parent's branch.

(Merge-commits avoid trap 1 but leave duplicate-looking history. Pick squash+rebase or merge-commits and stay consistent.)

## Before you start
- Map the chain (`gh pr list`): each PR's head/base; the bottom PR's base is the shared base.
- Capture every **old-parent-tip SHA** now (`git rev-parse origin/<branch>`) — they go unreachable as you rewrite. Each branch's current tip is the next branch's drop-point.
- If the base isn't branch-protected, **you are the merge gate** — wait for CI yourself.

## Runbook — per PR, bottom-up (branch `B`, original parent tip `T`, next child `C`)
1. `git fetch origin` (base may have advanced).
2. `git checkout B && git rebase --onto origin/<base> T`. **Verify** `git diff --stat origin/<base>..HEAD` shows *only* this item's files (no phantom upstream); resolve any real conflict.
3. `git push --force-with-lease origin B` — feature branch only, never the base.
4. If child `C` exists: `gh pr edit C --base <base>` (before the delete, or `C` auto-closes).
5. Wait for CI green: `gh pr checks P --watch`.
6. `gh pr merge P --squash --delete-branch` with explicit `--subject`/`--body`.
7. Next PR.

After the last merge: prune stray branches; confirm linked issues auto-closed.

## Rules
- Bottom-up only; never a child before its parent.
- Verify the single-item diff before every force-push.
- `--force-with-lease`, feature branches only.
- Retarget the next child before deleting the current branch.
- On an unprotected base, wait for CI green per PR.

## Don't use when
A single PR, or independent (non-stacked) PRs — just merge. Stack still under review — land it later.

## Recovery
- **Child closed** (base deleted first): can't reopen — recreate (`gh pr create --base <base> --head <branch> --body "supersedes #N"`), then rebase.
- **Rebase pulled phantom files:** wrong drop-point — `git rebase --abort`, recompute `T`, retry.
