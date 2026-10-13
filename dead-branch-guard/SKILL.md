---
name: dead-branch-guard
description: 'Install a pre-push guard against pushing to a branch whose PR already merged.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# dead-branch-guard

## Hook behavior

For each **remote branch** being pushed (`HEAD:x` and `tmp:x` both target `x`):

1. Read newest-first PRs with `gh pr list --head <branch> --state all --limit 10`.
2. Allow if the newest PR is `OPEN`.
3. Otherwise refuse if any `MERGED` PR's merge commit is not an ancestor of the pushed commit. A newer closed-unmerged PR does not hide it.

Reused branches are allowed once the base's merge or squash commit is merged back. No fetch is needed: an unknown merge commit cannot be a local ancestor.

Missing `gh`, `jq`, or `timeout`, or a failed `gh pr list`, fails open with one stderr line. Failures include network errors and a second remote without `gh repo set-default`. Invalid JSON means no PR. Tags and deletions are skipped. Deliberate bypass: `git push --no-verify`.

## Install

```bash
bash <skill-dir>/scripts/install.sh [repo-dir]
```

Installs `pre-push` in `.githooks/`, pins LF in `.gitattributes`, and sets an **absolute** `core.hooksPath`. Commit both files. Every other clone must enable hooks from its main checkout:

```bash
git config core.hooksPath "$(git rev-parse --show-toplevel)/.githooks"
```

Add this command to contributor or agent docs. A relative path silently misses hooks in worktrees branched before `.githooks/` existed; the absolute path shares the main checkout's copy.

Keep enforcement in the git hook: command-text filters miss shell variants and can mistake prose for pushes. Before editing a PR, separately check `gh pr view --json state`; never edit a non-OPEN PR.

## Recovery and tests

Follow the hook's remedy: continue with `git fetch origin && git merge origin/<base>`, push, then `gh pr create`; or rehome:

```bash
git checkout -b <new-branch> origin/<base> && git cherry-pick <first-new-sha>^..HEAD
bash <skill-dir>/scripts/pre-push.test.sh
```

The 16-case test uses stubbed `gh` and real git ancestry. It covers alternate refspecs, rehoming, merged-back bases, PR states, ignored refs, multi-ref pushes, and failed/invalid responses.
