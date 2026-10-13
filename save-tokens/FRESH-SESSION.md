# Fresh-session launcher

A fresh session:

1. Write the [`handoff`](../handoff/SKILL.md) `lite` note to `handoff.md` in a folder of its own in
   the scratchpad (the system temp directory when there is none), never in the target worktree,
   where the next `git add -A` would commit it. Beside it write a launcher that
   reads the note at run time, so multi-line text and quotes survive:
   - Windows, `launch.ps1`: `claude (Get-Content -Raw "$PSScriptRoot\handoff.md")`
   - macOS and Linux, `launch.sh` (made executable):
     `cd "<dir>" && claude "$(cat "$(dirname "$0")/handoff.md")"`
2. Show the note and the command, then ask in one line: "This needs little of our context. Start it
   fresh? (yes)"
3. On yes, run the command yourself and do not start the request here. It opens a new terminal
   window in `<dir>` running interactive `claude` with the note as its first prompt, so the user
   types nothing else. Never clear or compact on the user's behalf.

`<dir>` and the launcher are absolute paths. Never pass the command inline through `wt`: it splits
its own command line on `;`, and a quoted `-Command` string can be taken as the program name.

```powershell
wt -w new -d "<dir>" pwsh -NoExit -File "<launch.ps1>"
# no wt:
Start-Process pwsh -ArgumentList '-NoExit','-File','"<launch.ps1>"' -WorkingDirectory "<dir>"
```

```bash
open -a Terminal "<launch.sh>"            # macOS
x-terminal-emulator -e bash "<launch.sh>" # Linux
```

No terminal launcher (SSH, no display): tell the user to run the launcher in a new terminal, or to
run `/clear` and paste the note (`/rename` first if they want this session back).
