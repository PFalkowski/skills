---
name: merge-stack
description: 'Land a chain of stacked PRs bottom-up without the two traps: squash-merging a parent rewrites its commits so each child phantom-conflicts until rebased, and deleting a merged branch auto-closes the next child PR irrecoverably. Use after building a stack of dependent PRs, or on "merge the stack", "land the chain", "ship the stacked PRs", /merge-stack.'
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

## GitHub native stacks

If `gh pr edit --base` fails with *"Cannot change the base branch because the pull request is part
of a stack"*, the chain is a GitHub-native stack — skip this runbook's retarget/rebase
choreography entirely: after each parent merges, the platform auto-retargets **and** auto-rebases
the next child (both traps handled upstream). Plain `gh pr merge` is refused too; merge each PR
with the asynchronous REST API and poll the UUID it returns:

```
gh api -X PUT repos/{owner}/{repo}/pulls/{n}/merge-async \
  -f merge_method=squash -f commit_title="…" -f commit_message="…"
gh api repos/{owner}/{repo}/pulls/{n}/merge-async/{uuid}   # until "status": "merged"
```

What still applies: bottom-up order, and waiting for CI green per PR (the auto-rebase re-triggers
checks on each child). What to expect: branch SHAs move under you between merges — the stack
machinery rebases them — so re-fetch before any local operation and don't treat a moved tip as
someone else's interference.
