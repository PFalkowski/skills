---
name: merge-stack
description: 'Land stacked PRs bottom-up without phantom conflicts or auto-closed children.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# merge-stack

Land stacked PRs bottom-up onto the bottom PR's base. Single/independent PRs need no stack procedure; wait if review is unfinished.

Squash merging replaces parent commits, so each child needs `rebase --onto <base> <old-parent-tip>` to avoid phantom diffs/conflicts. Deleting a parent's branch closes its child PR irrecoverably: **retarget the child first**. Merge commits avoid the rewrite but leave duplicate-looking history; choose one strategy consistently.

## Prepare

Map PR heads/bases with `gh pr list`. Capture **every old-parent-tip SHA** using `git rev-parse origin/<branch>` before rewriting; each tip is the next child's drop-point. On an unprotected base, enforce the CI gate yourself.

## Per PR, bottom-up

For branch `B`, original parent tip `T`, PR `P`, next child `C`:

1. `git fetch origin`.
2. `git checkout B && git rebase --onto origin/<base> T`. Resolve real conflicts; verify `git diff --stat origin/<base>..HEAD` contains only this item's files.
3. `git push --force-with-lease origin B` — feature branches only, never the base.
4. If a child exists: `gh pr edit C --base <base>` before deleting its parent.
5. Wait for green CI: `gh pr checks P --watch`.
6. `gh pr merge P --squash --delete-branch` with explicit `--subject`/`--body`.
7. Repeat. After the last merge, prune stray branches and confirm linked issues auto-closed.

Wrong drop-point/phantom files: `git rebase --abort`, recompute `T`, retry. Child closed after base deletion: recreate with `gh pr create --base <base> --head <branch> --body "supersedes #N"`, then rebase.

## GitHub native stacks

If retargeting reports “Cannot change the base branch because the pull request is part of a stack”, skip the manual rebase/retarget procedure: GitHub automatically does both after each parent merges. Plain `gh pr merge` is also refused; use asynchronous REST merging and poll the returned UUID:

```
gh api -X PUT repos/{owner}/{repo}/pulls/{n}/merge-async \
  -f merge_method=squash -f commit_title="…" -f commit_message="…"
gh api repos/{owner}/{repo}/pulls/{n}/merge-async/{uuid}   # until "status": "merged"
```

Still merge bottom-up and wait for green CI on each child after its automatic rebase. Re-fetch before local operations: moving tips are expected stack machinery, not necessarily outside interference.
