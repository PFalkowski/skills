---
name: dump-sessions
description: Dump a handover for every recently-active Claude Code session by reading the on-disk transcripts — cwd, git branch, last prompt, last substantive turns, and a live git-risk check (uncommitted/unpushed) per workspace. Works AFTER a crash or power loss, when the live processes are already gone and no process/PEB inspection is possible. Use when the user says "dump all sessions", "handover for all my sessions", "power's about to go / UPS", "I'm moving machines", "what was I working on everywhere", or needs to recover session state across every open repo at once. For one session use handoff; to regenerate the Windows Terminal tabs themselves use snapshot-terminal-sessions.
---

# Dump sessions

Write a single handover covering **every** recently-active Claude Code session, not just the
current one. The trick: a session agent can only see its own context, but Claude Code flushes
each session to disk as `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` on every message.
Those files are the only part of a session that survives the machine going down — so this reads
them directly instead of inspecting live processes. It therefore works **after** a crash or
power cut, when the `claude.exe` processes (and any PEB-based cwd detection) are already gone.

## Quick start

Run the bundled script and report its output to the user:

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/Dump-ClaudeSessions.ps1"
```

It writes `~/HANDOVER-ALL.md` and prints one line per workspace. Then read that file and relay
the highlights — especially any workspace with uncommitted or unpushed work at risk.

Useful parameters:

- `-SinceMinutes 180` — how far back to count a transcript as "active" (default 3h). Widen to
  reach older sessions; narrow to just the last work burst.
- `-Tail 4` — substantive turns to include per session.
- `-OutputPath <path>` — where to write the dump (default `~/HANDOVER-ALL.md`).

## What each session entry contains

- **cwd** and **git branch** (from the transcript).
- **session id** + the exact `claude --resume <id>` command to reopen it in that directory.
- **git now** — a live `git status` in that cwd: uncommitted file count (with a sample) and
  unpushed commit count. This is the state a receiver actually needs, because it is the only
  part that is *not* reconstructable — surface it first.
- **last prompt** and the **last few substantive turns** (tool-only turns are dropped).

## How "active" and "one workspace" are decided

- **Active** = transcript `LastWriteTime` within `-SinceMinutes`. mtime is used deliberately
  rather than live-process detection so this still works on a rebooted machine.
- Enumeration is **one level deep only** (`<projects>/<cwd>/<session>.jsonl`); spawned-agent
  transcripts under each project's `subagents\` subfolder are excluded — they are not user
  sessions and would swamp the dump.
- A workspace that has been resumed repeatedly leaves several transcripts behind; entries are
  collapsed to the **newest transcript per cwd+branch**, with the fold count noted.

## Relationship to other skills

- **handoff** — writes a careful, minimal handover for the *single current* session. Use that
  when you have one session's full context in hand; use this when you need *all* of them and
  can only read them from disk.
- **snapshot-terminal-sessions** — regenerates the Windows Terminal *tabs* (which repos had a
  session open, how to relaunch them) by inspecting live processes. That recovers the layout;
  this recovers the *content/state*. They are complementary and neither needs the other — but
  snapshot only works while the machine is still up, whereas this also works after a crash.
