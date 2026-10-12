---
name: snapshot-terminal-sessions
description: 'Save Windows Terminal tabs running Claude Code to a PowerShell script for later resumption.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Snapshot terminal sessions

Run and report the bundled script:

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/Snapshot-ClaudeSessions.ps1"
```

Default output: `$HOME\scripts\reopen-claude-sessions.ps1`, created if missing; override with `-OutputPath <path>`. It replaces its own output, never a differently named handwritten template. Resume later with:

```powershell
pwsh -File "$HOME\scripts\reopen-claude-sessions.ps1"
```

## Behavior and limits

- Enumerates `Get-CimInstance Win32_Process` for `claude.exe`/`claude-monitor.exe` descended from `WindowsTerminal.exe`; reports skipped sessions hosted elsewhere.
- Reads actual cwd through PEB (`NtQueryInformationProcess` + `ReadProcessMemory`), same user/bitness, without admin.
- Emits one tab per session, titled by cwd leaf. Original UI tab titles cannot be recovered.
- Normally uses `claude --continue`. For multiple sessions sharing cwd, resolves exact IDs from `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`: first match process start to transcript creation time; for resumed sessions, match the sole remaining process/file touched in the last 2h by elimination. Remaining ambiguity uses interactive `claude --resume`, never a guess.
- Pairs a monitor and Claude session with identical cwd as `split-pane --size 0.5`.

Windows Terminal + PowerShell only. Other tab/pane relationships are unrecoverable; each session gets a tab. Hand-edit other splits into the generated script (add `\`; split-pane ...` after the relevant `new-tab`), as in the reference template.
