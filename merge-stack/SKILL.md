---
name: merge-stack
description: Land a stacked chain of dependent PRs onto its base branch (usually main/master), bottom-up, without hitting the two traps that bite stacked-PR merges. Trap 1 — squash-merging a parent rewrites its commits, so each child phantom-conflicts until rebased onto the freshly-advanced base. Trap 2 — deleting a merged branch auto-CLOSES the next child PR (a closed PR with a deleted base cannot be reopened), so the child must be retargeted to the base first. Use after building a stack of PRs (e.g. a NightShift run) or any time you have PRs where each branch is based on the previous one. Triggers — "merge the stack", "land the chain", "ship the stacked PRs", /merge-stack.
---

# merge-stack

Land a stacked chain of PRs — each branch based on the previous, each PR's base = the previous branch — onto the shared base (usually `main`/`master`), one at a time, bottom-up. Naive merging is destructive here because of two non-obvious traps; this skill exists to avoid them.

## The two traps (why naive merging fails)

1. **Squash-merge makes stacked diffs phantom-conflict.** When you squash-merge the bottom PR, its commits land on the base as ONE new commit with a new SHA — not the original branch commits. The next child still physically contains those old upstream commits, so git sees unrelated history: the child's PR diff balloons to re-include the already-merged changes, and edits to shared files (architecture tests, solution/manifest files) conflict. **Fix:** before merging each child, rebase it `--onto <base> <old-parent-tip>` to drop the already-merged commits, leaving a true single-item diff.

2. **Deleting a merged PR's head branch CLOSES the next child PR.** A PR whose base branch is deleted is not retargeted by the host — it is *closed*. And a closed PR whose base branch is gone **cannot be reopened**; you must recreate it as a new PR (losing the number and its threads). **Fix:** retarget the next child's base → `<base>` BEFORE deleting the just-merged branch (or merge without auto-delete and clean up at the end).

If you merge with **merge commits** instead of squash, trap 1 disappears (the branch commits land as-is) but you get duplicate-looking history. Squash + rebase is the cleaner end state. Pick one strategy and stay consistent across the chain.

## Before you start

- **Map the chain:** `gh pr list` (or host equivalent) — note each PR's head and base. The bottom PR's base is the shared base.
- **Capture every old-parent-tip SHA now** (`git rev-parse origin/<each-branch>`). You rebase each child `--onto <base> <its-original-parent-tip>`, and these SHAs become unreachable once you start rewriting branches. Conveniently, each branch's current tip is the next branch's drop-point.
- **Check base protection.** If the base requires status checks, the host gates the merge. If it does NOT, **you are the gate** — wait for CI green yourself before each merge.
- Confirm you actually want to land it now (this skill merges; if the stack is still under review, stop).

## Procedure (repeat per PR, bottom-up)

For each PR `P` (branch `B`, original parent tip `T`, next child PR `C`):

1. `git fetch origin` — the base may have advanced from the previous merge.
2. **Rebase to a single-item diff:** `git checkout B` then `git rebase --onto origin/<base> T`. VERIFY before pushing: `git log --oneline origin/<base>..HEAD` shows only this item's commits, and `git diff --stat origin/<base>..HEAD` shows only this item's files — no phantom upstream files. A real conflict here is a genuine shared-file overlap; resolve it.
3. **Force-push the feature branch only:** `git push --force-with-lease origin B`. NEVER force-push the base or any shared branch.
4. **Retarget the next child** (if any): `gh pr edit C --base <base>` — do this BEFORE the delete in step 6, so deleting `B` does not cascade-close `C`.
5. **Wait for CI green** on `P` (the rebased branch re-runs checks): `gh pr checks P --watch`. Don't merge on pending/red unless you accept the risk on an unprotected base.
6. **Merge + delete:** `gh pr merge P --squash --delete-branch` with an explicit `--subject`/`--body` (so it doesn't open an editor) — keep the conventional-commit subject and any required trailers.
7. Move to `C` and repeat.

After the last merge: confirm no stray remote branches remain (`git ls-remote --heads origin '<prefix>/*'`), prune local branches, and confirm each PR's linked issues auto-closed.

## Hard rules

1. **Bottom-up only.** Merge the PR whose base is the shared base first; never a child before its parent.
2. **Verify the single-item diff before every force-push.** The rebase is correct only if `origin/<base>..HEAD` is just this item. A wrong drop-point silently drops or re-introduces commits.
3. **`--force-with-lease`, feature branches only.** Never plain `--force`; never the base or a shared branch.
4. **Retarget the next child before deleting the current branch.** Skip it and the child auto-closes; a closed PR with a deleted base can't be reopened, only recreated.
5. **On an unprotected base, you are the gate.** Wait for CI green per PR — the rebased branch is a new state even though the changes passed once already.
6. **Choose squash OR merge-commits and stay consistent** across the whole chain; don't mix.

## When NOT to use this
- A single PR (no stack) — just merge it.
- Independent PRs not based on each other — merge in any order; no rebase needed.
- The stack is still under review — this skill lands it; don't run it yet.

## Recovery
- **A child got closed** (its base branch was deleted before retarget): you cannot reopen it. Recreate — `gh pr create --base <base> --head <its-branch> --title ... --body "(supersedes #<closed>)"` — then rebase it as normal.
- **Rebase pulled in phantom files:** wrong `--onto` drop-point. `git rebase --abort`, recompute the original parent tip (the commit the branch diverged at, before the parent's own commits), and retry.
