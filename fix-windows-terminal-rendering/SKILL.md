---
name: fix-windows-terminal-rendering
disable-model-invocation: true
description: 'Fix overlapping rows or redraw corruption in Windows terminals via host changes or full repaints.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Fix Windows terminal rendering

Use for overwritten rows, resize corruption, failed `Ctrl+L` repaints, or drifting box/status lines. Garbled glyphs are an encoding problem, outside this fix. Legacy `conhost.exe` can corrupt cursor-based grids; changing the per-user host needs no admin or reinstall.

## Diagnose

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action status
```

Change the host **only** for “Let Windows decide” or an unrecognized pair. If already Windows Terminal, inspect its rendering/font settings, SSH/tmux layers, or the application.

For corrupt alternate-screen TUIs on Windows Terminal, ConPTY incremental-write issues are documented in microsoft/terminal#15976 and resize issues in #4389. For Claude Code with `"tui": "fullscreen"`, try `CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1` in `~/.claude/settings.json`'s `env` block; conservative fallback: `"tui": "default"`. Other TUIs may offer full redraw/no alternate screen.

Verify switches against the installed build: `grep -c CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT <install>/bin/claude.exe` checks existence; `claude --debug-to-stderr` shows loaded `settingsEnv keys:`. These changes affect new sessions only.

## Apply or undo

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action apply_windows_terminal
```

Use `-Preview` for Windows Terminal Preview. The script rejects a missing package unless `-Force` is supplied; install first with `winget install --id Microsoft.WindowsTerminal`. **Open a new terminal window**: existing consoles retain their host.

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action restore_default
```

Restore deletes both values and the key if otherwise empty. Any action accepts `-WhatIf`.

## Registry details

Key: `HKCU:\Console\%%Startup` (literal doubled `%%`). Set both `REG_SZ` values to their **different** CLSIDs:

| Value | Windows Terminal | Windows Terminal Preview |
|---|---|---|
| `DelegationConsole` | `{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}` | `{06EC847C-C0A5-46B8-92CB-7C92F6E35CD5}` |
| `DelegationTerminal` | `{E12CFF52-A866-4C77-9A90-F570A7AA2C6B}` | `{86633F1F-6454-40EC-89CE-DA4EBA977EE2}` |

The first selects OpenConsole, the second WindowsTerminal. Missing one or reusing one GUID mismatches the pair and falls back to the legacy host. Both absent or both `{00000000-0000-0000-0000-000000000000}` mean “Let Windows decide”.

Verify the package's `com.microsoft.windows.console.host` and `com.microsoft.windows.terminal.host` extension CLSIDs:

```powershell
$loc = (Get-AppxPackage Microsoft.WindowsTerminal).InstallLocation
Select-String -Path "$loc\AppxManifest.xml" -Pattern '<Clsid>' -Context 2,0
```

For manual changes, use Settings → System → For developers → Terminal, or Windows Terminal → Settings → Startup → Default terminal application. Both write these values; prefer the GUI with a human at the keyboard.
