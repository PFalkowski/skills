---
name: whats-next
description: 'Rank work across repos and open the chosen task when no target is set; optionally prune dead worktrees.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# whats-next

## Quick start

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/wip.ps1"
```

POSIX (Linux/macOS/WSL/Git Bash):

```sh
"<skill-dir>/scripts/wip"
```

Launchers require .NET 10 SDK, build/cache the console app, and rebuild only when source changes. No LLM calls. Repositories come from live Claude Code sessions and `~/.claude/projects/*/*.jsonl`, not configured checkout paths.

No arguments prints a ranked board, writes `board.html` beside `board.json`, and opens the browser. `-Html` opens only HTML. Its Light/Auto/Dark choice persists; Auto follows OS/browser. `-h`, `-?`, or `--help` shows full parameters without changes.

For optional shell aliases or Windows click-to-resume setup, read [SETUP.md](SETUP.md). Do not register the protocol without opt-in.

## The ranking ladder

| Rank | Mark | Meaning |
|---|---|---|
| 1 | MERGE | Open PR green and mergeable |
| 2 | REVIEW | Unresolved threads, requested changes, conflicts, or failed checks |
| 3 | NO PR | Pushed branch without PR; if forge was not checked, explicitly say unknown |
| 4 | AT RISK | Unpushed commits/dirty worktree with no active occupant |
| 5 | ASKED | Background session waiting for input |
| 6 | BACKLOG | Open `prompts/backlog.md` items |
| 7 | STALE | No commit within `-StaleDays` (default 7) |

Drafts, pending checks, and required reviews awaiting approval do not rank 1 and are omitted unless another actionable condition applies. Failures/conflicts rank 2.

Group by repo, ordered by its hottest item; within repo sort by rank. Show at most `-PerRank` (default 5) per rank. Terminal shows remaining count; HTML offers expandable rows with resume buttons.

## `wip <n>` and `wip prune`

`wip <n>` uses the latest board at `$env:AGENTS_STATE/whats-next/board.json`, or `~/.agent-state/whats-next/board.json`. Refresh stale boards first: every run overwrites item numbering. Change to the item's directory **before** resuming its last known session; otherwise start a fresh named session.

`wip prune` defaults to a dry run. `-Apply` executes `git worktree remove`; `-Fetch` first runs `git fetch --prune` once per repo, refreshing remote-deletion knowledge. Ignored files block removal unless `-IncludeIgnored` is explicit: removal deletes them, including local config/state.

Only propose removal when the branch is an ancestor of default (ordinary merge), or the forge confirms a PR from that branch head merged (covers squash merges). Never propose dirty/untracked/stashed worktrees. Deleted upstream alone is not proof: report unmerged commits and leave the worktree.

## Boundaries

`dump-sessions` saves crash-recovery handovers; `snapshot-terminal-sessions` restores Windows tab layouts; `wrap-up` closes a session; `handoff` transfers one session's context; `prompt-backlog` manages deferred prompts that this board only reads.

## When not to use this

For a known session, use `claude --resume` or `/resume`: `Ctrl+W` includes current repo worktrees, `Ctrl+A` includes all projects, and a pasted PR URL jumps to its creating session. Use this board when choosing what to do next.

## Two platform facts

- Experiments showed resumed sessions use the launch directory, contrary to published docs. Always enter the target worktree before `claude -r`.
- Git, `gh api graphql`, and `claude agents --json` are supported interfaces. Historical/ordinary terminal activity and resume IDs require internal JSONL transcripts: `claude agents --json` covers only background sessions. Formats may change per release. Skip malformed lines; unreadable activity can remove a repo from the board or lose its session ID, causing a fresh session instead of resume.
