---
name: snapshot-terminal-sessions
description: Snapshot the Windows Terminal tabs currently running Claude Code sessions and write a `wt`-based .ps1 that recreates them later with each session resumed (not restarted). Use when the user says "wrap up", "snapshot sessions", "snapshot terminals", "save my session layout/tabs", or wants to close everything down without losing track of which repos had Claude sessions open.
---

# Snapshot terminal sessions

Windows Terminal has no API for reading live tab/pane state, so this works by walking the
OS process tree: find every `claude.exe` (and `claude-monitor.exe`) descended from
`WindowsTerminal.exe`, read each one's real working directory straight out of its PEB
(no cmdlet exposes another process's cwd), and emit one `wt new-tab` per session.

## Quick start

Run the bundled script and report its output to the user:

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/Snapshot-ClaudeSessions.ps1"
```

By default it writes to `$HOME\scripts\reopen-claude-sessions.ps1` (created if missing).
Pass `-OutputPath <path>` to write elsewhere. It never overwrites a differently-named,
hand-written template — only its own output file.

To recreate the layout later, the user just runs the generated script:

```powershell
pwsh -File "$HOME\scripts\reopen-claude-sessions.ps1"
```

## What it does

- Walks `Get-CimInstance Win32_Process`, filters `claude.exe`/`claude-monitor.exe` whose
  ancestry traces back to a `WindowsTerminal.exe` process (skips ones hosted elsewhere,
  e.g. VS Code's integrated terminal, and reports how many were skipped).
- Reads each match's actual cwd via a PEB read (`NtQueryInformationProcess` + `ReadProcessMemory`,
  same-user/same-bitness, no admin needed).
- Emits one tab per session, titled after the cwd's leaf folder name (Windows Terminal tab
  titles are UI-only state and can't be read back from a process, so this is the closest
  available default — matches the convention of hand-written templates that title tabs after
  the repo folder anyway).
- Uses `claude --continue` to resume the most recent conversation in that directory. If two+
  live sessions share the same directory, `--continue` can't tell them apart, so it tries to
  resolve the *exact* session id for each: Claude Code stores each session as
  `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, and a freshly started session creates
  its file within seconds of the process starting, so process-start-time vs. file-creation-time
  proximity gives a high-confidence match. For a resumed (not freshly started) session with no
  such signal, it falls back to matching the one remaining process against the one remaining
  file touched in the last 2 hours, by elimination. Anything still ambiguous after that gets
  a bare `claude --resume` (interactive picker) rather than a guess.
- Pairs a `claude-monitor.exe` with a `claude.exe` session into one tab (as a `split-pane
  --size 0.5`) when their directories match exactly.

## Known limitation

Windows Terminal doesn't expose which processes share a tab vs. sit in separate tabs/panes,
so tab/pane topology beyond the claude↔claude-monitor pairing above is **not** recoverable —
every session becomes its own tab. If the real layout had other multi-pane arrangements
(e.g. a log tail or build watcher split next to a session), the generated script won't
reproduce that; hand-edit it (add `` `; split-pane ... `` after the relevant `new-tab`) the
same way the reference template does it.

This is Windows Terminal + PowerShell specific by design — it matches how Claude Code is
actually run in this environment; no need to generalize to other terminals.
