---
name: whats-next
description: 'Prints a ranked cross-repository board of what to work on next - PRs waiting on you, dirty worktrees, blocked sessions, backlog items - then puts you into the item you pick; can also prune worktrees that are safely dead. Triggers: no fixed target for a new session, asking what to work on, or clearing dead worktrees.'
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

Costs no model tokens — it is a plain PowerShell script. Run it with no arguments any time you
need to decide what to pick up next; it prints one ranked board across every repository you have
recent activity in.

Wire it into the PowerShell profile once, so it is one word from any prompt. Open `$PROFILE`
(`notepad $PROFILE`, creating it if it does not exist) and add:

```powershell
function wip { pwsh -NoProfile -File "<skill-dir>/scripts/wip.ps1" @args }
```

Reload it (`. $PROFILE`) or open a new terminal. From then on, `wip`, `wip <n>`, and `wip prune`
work from any directory.

## The ranking ladder

Items are ranked 1 (hottest) through 7 (coolest):

| Rank | Mark    | Meaning |
|------|---------|---------|
| 1 | `MERGE`   | Open PR is green and mergeable — waiting on you to merge it |
| 2 | `REVIEW`  | Open PR has unresolved review threads, or changes were requested |
| 3 | `NO PR`   | Branch is pushed with no pull request open for it |
| 4 | `AT RISK` | Worktree has uncommitted changes and nobody is sitting in it |
| 5 | `ASKED`   | A background session is blocked, waiting on your answer |
| 6 | `BACKLOG` | Worktree has open items in its `prompts/backlog.md` |
| 7 | `STALE`   | No commit in longer than `-StaleDays` (default 7) — a cleanup candidate |

A draft PR, a PR still waiting on a required review, or a PR with a pending/failing check never
ranks 1 — it is left off the board rather than reported as ready.

Items are grouped by repository, but the repositories themselves are ordered by their single
hottest item, not alphabetically and not by item count. A repository holding one rank-1 item is
listed above a repository holding ten rank-4 items — a pull request waiting on you cannot hide
behind routine work somewhere else. Within a repository, its own items stay together and sort by
rank. Each repository shows at most `-PerRank` (default 5) items per rank before collapsing the
rest into a count.

## `wip <n>` and `wip prune`

`wip <n>` launches item `n` from the board most recently printed by a plain `wip` run (cached at
`$env:AGENTS_STATE/whats-next/board.json`, or `~/.agents/whats-next/board.json` when
`AGENTS_STATE` is unset). Re-run `wip` first if the board might be stale — each run overwrites
that file, and the numbers only match the board you are currently looking at. It changes
directory into the item's path, then resumes the session that last worked there if one is known,
or starts a fresh named session if not.

`wip prune` proposes worktrees safe to delete. **The default is a dry run** — it only lists what
it would remove and changes nothing. Pass `-Apply` to actually run `git worktree remove` on the
listed worktrees. Pass `-Fetch` to `git fetch --prune` each repository first (one network round
trip per repository), so a branch deleted on the remote is recognized; without it, that
recognition is only as fresh as your last fetch. Pass `-IncludeIgnored` to also allow removing a
worktree that holds ignored files — `git worktree remove` deletes those without a word, and
ignored is exactly where local configuration and skill state tend to live, so they are held back
unless you ask for them.

**Safety rule.** A worktree is proposed for removal only when its branch is an ancestor of the
repository's default branch (an ordinary merge), or when the forge's own record shows a pull
request from that branch head already merged — this second check exists because a squash merge
rewrites the branch into one new commit on the default branch, so its own commits are never
literal ancestors of it, and the forge is the only thing left that still knows. A worktree with
uncommitted changes, untracked files, or a stash is **never** proposed, regardless of merge
state — a stash is not restored by anything here, so it survives exactly because the worktree is
left alone. A branch whose upstream was deleted on the remote is **not**, by itself, treated as
safe: without one of the two merge signals above it is reported as holding unmerged commits and
left alone, because a branch can outlive its own remote while still holding commits that exist
nowhere else.

## Boundaries

Five neighbouring skills touch adjacent ground; know which one to reach for:

- **dump-sessions** — saves a crash-safe handover for every recently-active session, for disaster
  recovery after a crash or power loss.
- **snapshot-terminal-sessions** — restores a Windows Terminal tab layout, not session content.
- **wrap-up** — closes a session: ships, sweeps, and accounts for what is left before you stop.
- **handoff** — carries one session across a context boundary (a fresh context, another agent,
  `/clear`/`/compact`).
- **prompt-backlog** — stores deferred work as an ordered queue of ready-to-run prompts; this
  skill reads that queue as one of its ranked sources but does not manage it.

This skill is the entry counterpart to `wrap-up`'s exit: `wrap-up` closes what you were in, this
picks the one thing to be in next.

## When not to use this

If you already know which session you want to resume, the built-in picker is faster than this
skill: run `claude --resume` (or `/resume` inside a session). Press `Ctrl+W` to widen it to every
worktree of the current repository, `Ctrl+A` to widen it to every project on this machine, and
paste a pull request URL into it to jump straight to the session that created it. Do not run this
skill for that — it exists for when you do not yet know which one thing to pick, not for
returning to a specific one you already have in mind.

## Two platform facts

These are load-bearing and non-obvious, so they are stated plainly rather than left implicit.

**A resumed session takes the directory it was launched from, not the worktree it originally ran
in.** This was established by experiment during this skill's build — resuming a worktree session
from a different directory and watching the transcript record the new path as the session's
working directory — and it contradicts the published documentation. `wip <n>` changes directory
into the target worktree *before* calling `claude -r`, never after, because doing it the other
way brings the agent back pointed at the wrong repository.

**Two different sources feed the board, and they are not equally durable.** Git status,
`gh api graphql`, and `claude agents --json` are all supported interfaces and stay stable across
a Claude Code upgrade. Everything else about which directories have seen recent activity, and
which past session to offer as the resume target for a given item, comes from reading
`~/.claude/projects/*/*.jsonl` transcript files directly. Claude Code documents that format as
unstable: "The entry format is internal to Claude Code and changes between versions, so scripts
that parse these files directly can break on any release." `claude agents --json` is the
supported alternative, but it does not close this gap — it only lists background sessions, not
an ordinary session you are simply chatting in from a terminal. So the transcript reader is used
anyway, and it degrades one line at a time: a line it cannot parse contributes nothing rather
than throwing. When a future release changes the format, you lose columns, not the whole board —
a repository whose only recent activity it can no longer read drops out of the candidate list,
and an item that still shows may lose its session id, so `wip <n>` starts a fresh session there
instead of resuming the one you had.
