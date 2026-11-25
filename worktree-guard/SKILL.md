---
name: worktree-guard
description: 'Install a hook that keeps agent worktrees under each repository''s .claude/worktrees folder.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# worktree-guard

## Hook behavior

A `PreToolUse` hook on the Bash and PowerShell tools. It denies any `git worktree add` (including `git.exe`, `git -C <dir>` and `git -c <key>=<value>`) whose arguments contain no `.claude/worktrees/` or `.claude\worktrees\` path, and tells the agent where to put the worktree instead. It also denies a `git worktree remove` whose target is the folder the session was launched in, or holds it: the session's transcript is filed under that folder's name (the parent folder of the hook input's `transcript_path`), so removing it leaves the session impossible to resume or message. A `cd` earlier in the command can move a relative target, so the hook also denies a relative target that ends like the launch folder's path, wherever it points. That check reads names loosely: `feature` also matches a launch folder named `my-feature`. An absolute target or `-C` folder is resolved exactly, which is how to remove a different folder with a similar name. Other commands pass untouched. Unreadable input fails open.

It reads command text, so prose that quotes `git worktree add ../x` (a PR body, say) is denied too, and so is prose that mentions `git worktree remove` when the words after it read as the launch folder. Both deny reasons tell the agent to pass such text through a file.

## Install

1. Add the hook to `~/.claude/settings.json`, keeping any existing `PreToolUse` entries:

   ```json
   "hooks": {
     "PreToolUse": [
       { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "node \"<skill-dir>/scripts/worktree-guard.js\"" }] }
     ]
   }
   ```

2. Ignore the folder in every repository at once, through the global git ignore file (`git config --global core.excludesFile`, or `~/.config/git/ignore` when unset):

   ```
   **/.claude/worktrees/
   ```

3. Remove merged worktrees on a schedule with `wip prune -Fetch -Apply`; see [whats-next](../whats-next/SKILL.md#scheduled-prune).

## Test

```bash
node --test <skill-dir>/scripts/worktree-guard.test.js
```
