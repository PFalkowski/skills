---
name: dead-branch-guard
description: 'Installs a versioned git pre-push hook that refuses a push to a branch whose newest PR already merged, unless the pushed commit contains that merge - the commits would otherwise land on a dead branch no PR tracks. Use when: a PR was merged while work continued on its branch, an agent pushed to a merged PR''s branch and nobody noticed, "protect against pushing to a merged branch", setting up a repo for unattended agents that push.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# dead-branch-guard

A human merges a PR while an agent keeps working on the same branch. Two hours later the agent
pushes 28 files to that branch and rewrites the merged PR's description. `git push` and
`gh pr edit` both succeed silently; the commit sits on a branch no PR tracks until someone
notices by eye. This skill installs the guard that refuses that push.

## What the hook checks

On every `git push`, for each branch being pushed:

1. `gh pr list --head <branch> --state all --limit 1` — the branch's newest PR.
2. If that PR is `MERGED` and its merge commit is **not** an ancestor of the commit being pushed,
   refuse the push and print the remedy.

"The branch has a merged PR" is deliberately not the signal — a repo may reuse one branch across
successive PRs, and after merging the base branch back the merge commit *is* an ancestor, so that
push is allowed. Only the missing merge marks a dead branch. Squash merges work the same way: the
squash commit lands on the base branch, and `merge-base --is-ancestor` finds it once the base is
merged back.

Fails open without `gh` or `jq`, on a network error, or when `gh` returns nothing usable. Tags and
branch deletions are never checked. The deliberate bypass is `git push --no-verify`.

## Install

```bash
bash <skill-dir>/scripts/install.sh [repo-dir]
```

Copies `pre-push` into `<repo>/.githooks/`, pins LF for that directory in `.gitattributes`, and
runs `git config core.hooksPath .githooks`. Commit `.githooks/` and `.gitattributes`. Git never
enables hooks on clone, so every other clone runs the config line once; the setting lives in the
shared `.git/config`, so all of a clone's worktrees get it. Put that line in the repo's
contributor or agent docs.

## Why a git hook, not an agent-side command filter

The first version of this guard was a Claude Code `PreToolUse` hook that regex-matched `git push`
in the agent's command text. An adversarial review found it missed `git push;`, any indented push
inside a `foreach {}` / `try {}` / `if … then` block, `git.exe push`, `git -c … push`, and denied
a commit message containing `(git push …)`. Every bypass was the same defect: guessing intent from
raw text. A pre-push hook sees the push itself, however it was spelled and whoever typed it — it
covers the human's terminal too. Put a guard where the action happens, not where the command is
typed.

Editing a merged PR's description is annoying but not lossy, so that half is prose, not a hook:
check `gh pr view --json state` before `gh pr edit`, and never edit a PR that is not OPEN.

## When it fires

Follow the message. Either continue the branch — `git fetch origin && git merge origin/<base>`,
push, `gh pr create` for the new commits — or rehome them:
`git checkout -b <new-branch> origin/<base> && git cherry-pick <first-new-sha>^..HEAD`.

## Tests

```bash
bash <skill-dir>/scripts/pre-push.test.sh
```

Eleven cases against a stubbed `gh` on PATH, with real git ancestry from whatever repo the test
runs in: the incident shape, the merge taken back, no PR, an open PR, tags, deletions, a
multi-ref push, `gh` failing, and garbage JSON.
