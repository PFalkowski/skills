---
name: merge-guard
description: 'Install a hook that refuses gh pr merge until a code review has seen the PR''s current head.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# merge-guard

## Hook behavior

A `PreToolUse` hook on the Bash and PowerShell tools. On any `gh pr merge`, it reads the PR with `gh pr view` and allows the merge only when a comment or review opening with `Reviewed at <sha>` names the PR's current head. [code-review-grill](../code-review-grill/SKILL.md) opens every summary thread with that line.

When the head moved after the newest review, it denies and names the delta to re-review (`<reviewed>..<head>`). It also denies:
- a merge with no review summary;
- a merge that does not name its PR literally;
- `--auto`, which would also merge commits pushed after the review;
- a PR that `gh` cannot read.

Other commands pass untouched, and unreadable hook input fails open.

It checks that the head was reviewed, not what the review found: the blocking findings still decide whether the PR is ready. It trusts whoever posted the summary line, so it catches an honest slip, not a forger.

It sees only `gh pr merge` on GitHub. A merge through `gh api` (as in [merge-stack](../merge-stack/SKILL.md)) or a push to the base branch passes it, and those still need the review rule by hand. It reads command text, so prose that quotes `gh pr merge` is checked too; the deny reason tells the agent to pass such text through a file.

## Install

Add the hook to `~/.claude/settings.json`, keeping any existing `PreToolUse` entries:

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "node \"<skill-dir>/scripts/merge-guard.js\"" }] }
  ]
}
```

It needs `gh` signed in to every repository the agent merges in.

## Test

```bash
node --test <skill-dir>/scripts/merge-guard.test.js
```
