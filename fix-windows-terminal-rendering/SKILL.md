---
name: fix-windows-terminal-rendering
description: 'Repoint the Windows default terminal host from legacy conhost.exe to Windows Terminal by writing the DelegationConsole/DelegationTerminal values under HKCU:\Console\%%Startup. Use when an interactive terminal UI on Windows smashes rows together, redraws over itself, loses its layout on resize, or when Ctrl+L does not clear/repaint the screen — and to undo that change.'
---

# Fix Windows terminal rendering

Interactive terminal programs (Claude Code, vim, lazygit, htop-alikes) draw by moving the
cursor around a fixed grid. Legacy `conhost.exe` reflows and truncates that grid in ways the
program is not told about, so rows smash together, a resize permanently corrupts the layout,
and `Ctrl+L` fails to repaint. Windows Terminal handles the same escape sequences correctly.

Which host runs is a per-user setting, so the fix is a registry write — no admin, no reinstall.

## Symptoms this fixes

- Lines overwriting each other, or two rows rendered into one
- Layout breaks on window resize and never recovers
- `Ctrl+L` does nothing (no clear, no repaint)
- Box-drawing/status lines drifting out of their column

If the symptom is instead *garbled glyphs* (mojibake, `?` for accented characters), that is
an encoding problem, not a host problem — this skill will not help.

## Check first

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action status
```

It prints both values and the host they resolve to. **Only proceed if it reports
"Let Windows decide" or an unrecognised pair.** If it already says `Windows Terminal`, the
host is not the cause and changing it will not fix anything — say so and go look elsewhere
(the terminal's own font/rendering settings, an SSH/tmux layer, or the program itself).

## Apply

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action apply_windows_terminal
```

Add `-Preview` to target Windows Terminal Preview. The script refuses to write if the
matching package is not installed (override with `-Force`); install it first with
`winget install --id Microsoft.WindowsTerminal`.

Then **open a new terminal window**. The host is chosen when a console is created, so
windows that are already open keep the old one — this is the most common "it didn't work"
report and is not a failure of the fix.

## Undo

```powershell
pwsh -NoProfile -File "<skill-dir>/set-host.ps1" -Action restore_default
```

Deletes both values (and the key, if nothing else lives in it), handing the choice back to
Windows. Also add `-WhatIf` to any action to see the change without making it.

## What actually gets written

Key: `HKCU:\Console\%%Startup` — the doubled `%%` is literally part of the key name.

Two `REG_SZ` values, which must be set **as a pair and to two different CLSIDs**:

| Value | Windows Terminal | Windows Terminal Preview |
|---|---|---|
| `DelegationConsole` | `{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}` | `{06EC847C-C0A5-46B8-92CB-7C92F6E35CD5}` |
| `DelegationTerminal` | `{E12CFF52-A866-4C77-9A90-F570A7AA2C6B}` | `{86633F1F-6454-40EC-89CE-DA4EBA977EE2}` |

`DelegationConsole` is the console host (OpenConsole) and `DelegationTerminal` is the terminal
window (WindowsTerminal). Writing the same GUID to both, or setting only one, leaves the pair
mismatched and Windows falls back to the legacy host — the single most likely way to "apply the
fix" and see no change. Both values absent, or both set to
`{00000000-0000-0000-0000-000000000000}`, means "Let Windows decide".

These GUIDs are not invented: they are the `<Clsid>` entries the Windows Terminal package
publishes under the `com.microsoft.windows.console.host` and `com.microsoft.windows.terminal.host`
app extensions in its `AppxManifest.xml`. To re-verify them on any machine:

```powershell
$loc = (Get-AppxPackage Microsoft.WindowsTerminal).InstallLocation
Select-String -Path "$loc\AppxManifest.xml" -Pattern '<Clsid>' -Context 2,0
```

## Doing it by hand

Settings → System → For developers → Terminal, or Windows Terminal → Settings → Startup →
Default terminal application. Both write exactly these values. Use the GUI when a human is
at the keyboard; use the script when it has to be scripted, checked, or reverted.
