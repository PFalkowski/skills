---
name: dead-branch-guard
description: 'Installs a versioned git pre-push hook that refuses a push to a branch whose PR already merged unless the pushed commit contains that merge, so commits never land on a dead branch. Use when a PR merged while work continued on its branch, "protect against pushing to a merged branch", or preparing a repo for agents.'
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

On every `git push`, for each **remote** branch being pushed (so `git push origin HEAD:x` and
`git push origin tmp:x` are judged as pushes to `x`):

1. `gh pr list --head <branch> --state all --limit 10` — the branch's PRs, newest first.
2. If the newest PR is `OPEN`, allow: something tracks the push.
3. Otherwise, if any `MERGED` PR's merge commit is **not** an ancestor of the commit being pushed,
   refuse the push and print the remedy. A newest PR that was closed unmerged does not hide the
   merged one behind it.

"The branch has a merged PR" is deliberately not the signal — a repo may reuse one branch across
successive PRs, and after merging the base branch back the merge commit *is* an ancestor, so that
push is allowed. Only the missing merge marks a dead branch. Squash merges work the same way: the
squash commit lands on the base branch, and `merge-base --is-ancestor` finds it once the base is
merged back. No fetch is needed: a merge commit the local repo has never seen cannot be an
ancestor of anything local, and `is-ancestor` on an unknown object already says no.

Fails open, printing one stderr line, without `gh`, `jq` or `timeout`, or when `gh pr list`
fails (network, or a second remote without `gh repo set-default`). Garbage from `gh` is treated
as no PR. Tags and branch deletions are never checked. The deliberate bypass is
`git push --no-verify`.

## Install

```bash
bash <skill-dir>/scripts/install.sh [repo-dir]
```

Copies `pre-push` into `<repo>/.githooks/`, pins LF for that directory in `.gitattributes`, and
sets `core.hooksPath` to the **absolute** path of that directory. Commit `.githooks/` and
`.gitattributes`. Git never enables hooks on clone, so every other clone runs this once, from its
main checkout:

```bash
git config core.hooksPath "$(git rev-parse --show-toplevel)/.githooks"
```

Trap: a *relative* `core.hooksPath` resolves against each worktree's own top level, so a worktree
branched before `.githooks/` existed silently runs no hook — git prints nothing. The absolute
form makes every worktree of the clone run the main checkout's copy. Put the line in the repo's
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

Sixteen cases against a stubbed `gh` on PATH that answers per `--head` branch, with real git
ancestry from whatever repo the test runs in: the incident shape, `HEAD:x` and `tmp:x` pushes, the
rehome recipe, the merge taken back, no PR, a newest open PR, a newest closed PR over a merged
one, tags, deletions, a multi-ref push, `gh` failing, and garbage JSON.
