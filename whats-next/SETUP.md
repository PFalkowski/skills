# Optional shell and protocol setup

Wire it into the PowerShell profile once, so it is one word from any prompt. Open `$PROFILE`
(`notepad $PROFILE`, creating it if it does not exist) and add:

```powershell
function wip { pwsh -NoProfile -File "<skill-dir>/scripts/wip.ps1" @args }
```

On a POSIX shell, add the equivalent to your shell's own startup file (`.bashrc`, `.zshrc`, ...):

```sh
wip() { "<skill-dir>/scripts/wip" "$@"; }
```

Reload it (`. $PROFILE`, or `. ~/.bashrc`/`. ~/.zshrc`) or open a new terminal. From then on,
`wip`, `wip <n>`, and `wip prune` work from any directory.

### Optional: one-click Resume from the HTML report

The report's "▶ wip N" button always *copies* the command — a web page, even a local one, cannot
start a local process on its own, full stop, no matter how the button is built. Registering a
`wip://` URL protocol closes that gap by giving Windows something to route the click to, so the
same button also launches it directly wherever the protocol is registered — including a copy of
the report shared elsewhere, such as a published Artifact.

```powershell
pwsh -NoProfile -File "<skill-dir>/scripts/register-protocol.ps1"
```

Windows only, user-scope (`HKEY_CURRENT_USER\Software\Classes\wip`), no admin required, entirely
opt-in — nothing else in this skill runs it for you, and nothing breaks if you skip it; the button
still works as a copy. A `wip://46` link then opens a new terminal running `wip 46` there. The
browser still asks once, the first time it meets an unfamiliar protocol ("Open PowerShell?" or
similar) — some browsers let you check "always allow" so it stops asking. It is specific to the
machine it is run on: registering it on a laptop does nothing for the same report opened on a
desktop. Remove it with `scripts/unregister-protocol.ps1`.

Plain `wip` (not `-Html`) asks about this itself, once: the first time it finds the protocol
unregistered in a real terminal, it offers to run `register-protocol.ps1` for you, `[y/N]`,
defaulting to no. It never asks again after that, whether you said yes or no — run
`register-protocol.ps1` by hand later if you skipped it. A non-interactive run (piped, CI, no
console) is never asked and never blocks on it.
