---
name: dump-sessions
description: 'Export handovers from recently active Claude Code sessions before shutdown or a machine move.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Dump sessions

Write one handover for every recently active Claude Code session from `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Transcripts flush each message, so this works after a crash without live processes.

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/Dump-ClaudeSessions.ps1"
```

Report the script output, read its default `~/HANDOVER-ALL.md`, and relay highlights, prioritizing uncommitted/unpushed work.

Parameters: `-SinceMinutes 180` (default activity window: 3h), `-Tail 4` (substantive turns per session), `-OutputPath <path>`.

Each entry contains transcript cwd/branch, session ID and exact `claude --resume <id>` command, live git status (uncommitted count/sample and unpushed count), last prompt, and substantive turns. Tool-only turns are dropped. Surface live git state first because the receiver cannot reconstruct it later.

Activity uses transcript `LastWriteTime`. Enumerate only `<projects>/<cwd>/<session>.jsonl`, excluding `subagents\`. Collapse repeated sessions to the newest transcript per cwd+branch and record the fold count.

The dump is sensitive, unredacted plaintext aggregating active repos' conversations. Its default location is outside repos but predictable; use a controlled `-OutputPath` or delete it after use (`Remove-Item ~/HANDOVER-ALL.md`).

Use **handoff** for a minimal current-session note. **snapshot-terminal-sessions** restores terminal layout from live processes and requires the machine still running; this skill restores content/state even after a crash.
