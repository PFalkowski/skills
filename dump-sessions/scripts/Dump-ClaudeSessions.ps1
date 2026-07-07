<#
.SYNOPSIS
  Dumps a handover for every recently-active Claude Code session by reading the
  on-disk transcripts - works even after a crash/power loss, when the live
  processes (and any PEB-based detection) are gone.

.DESCRIPTION
  Claude Code writes each session to ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl,
  flushed per message. That file is the only part of a session that survives the machine
  going down, so this reads it directly rather than inspecting live processes. A session
  counts as "active" if its transcript was written within -SinceMinutes.

  For each active transcript it extracts, from the JSONL, the generated title, cwd, git
  branch, the last user prompt(s) and the last assistant text, then runs a live
  `git status` in that cwd to surface uncommitted / unpushed work at risk. Everything is
  written to one markdown file, newest session first.

  This is the crash-safe complement to the snapshot-terminal-sessions skill: that one reads
  live processes to regenerate the Windows Terminal *tabs*; this one recovers each session's
  *content/state* from disk. Neither needs the other.

.PARAMETER SinceMinutes
  Only include transcripts written within this many minutes. Default 180 (3h). Widen to
  reach further back; narrow to just what you had open in the last work burst.

.PARAMETER Tail
  How many recent conversation turns to include per session. Default 4.

.PARAMETER OutputPath
  Where to write the markdown dump. Default $HOME\HANDOVER-ALL.md.

.PARAMETER ProjectsRoot
  Root of the Claude projects store. Default $HOME\.claude\projects.

.OUTPUTS
  Writes the markdown dump and prints a one-line-per-session summary.
#>
[CmdletBinding()]
param(
    [int]$SinceMinutes = 180,
    [int]$Tail = 4,
    [string]$OutputPath = (Join-Path $HOME 'HANDOVER-ALL.md'),
    [string]$ProjectsRoot = (Join-Path $HOME '.claude\projects')
)

if (-not (Test-Path $ProjectsRoot)) {
    Write-Output "No Claude projects store at $ProjectsRoot"
    return
}

$cutoff = (Get-Date).AddMinutes(-$SinceMinutes)

# Active transcripts = written since the cutoff. Reading LastWriteTime is cheap and, unlike
# process inspection, still works after the machine has been rebooted.
# One level deep only (<projects>/<encoded-cwd>/<session>.jsonl) - deliberately NOT recursive,
# so spawned-agent transcripts under each project's `subagents\` subfolder are excluded; those
# aren't user sessions and would swamp the dump.
$files = @(Get-ChildItem -Path (Join-Path $ProjectsRoot '*\*.jsonl') -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff } |
    Sort-Object LastWriteTime -Descending)

if ($files.Count -eq 0) {
    Write-Output "No Claude sessions active in the last $SinceMinutes minute(s) under $ProjectsRoot."
    return
}

function Get-BlockText {
    # A user/assistant message's .content is either a plain string or an array of blocks;
    # pull the human-readable text out of either shape.
    param($Content)
    if ($null -eq $Content) { return '' }
    if ($Content -is [string]) { return $Content }
    $parts = foreach ($b in $Content) {
        if ($b -is [string]) { $b }
        elseif ($b.type -eq 'text' -and $b.text) { $b.text }
        elseif ($b.type -eq 'tool_use') { "[tool: $($b.name)]" }
    }
    return (($parts | Where-Object { $_ }) -join "`n").Trim()
}

function Truncate {
    param([string]$Text, [int]$Max = 600)
    if (-not $Text) { return '' }
    $t = ($Text -replace '\s+', ' ').Trim()
    if ($t.Length -le $Max) { return $t }
    return $t.Substring(0, $Max) + ' ...[truncated]'
}

function Parse-Session {
    param([System.IO.FileInfo]$File)

    # Transcripts can be tens of MB; only the tail carries recent cwd/branch/content, and
    # metadata lines (cwd/gitBranch) repeat on nearly every message, so the tail is enough.
    $lines = Get-Content -Path $File.FullName -Tail 1500 -ErrorAction SilentlyContinue

    $cwd = $null; $branch = $null; $title = $null; $lastPrompt = $null
    $turns = New-Object System.Collections.Generic.List[object]

    foreach ($line in $lines) {
        if (-not $line) { continue }
        $d = $null
        try { $d = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }

        if ($d.cwd) { $cwd = $d.cwd }
        if ($d.gitBranch) { $branch = $d.gitBranch }
        switch ($d.type) {
            'ai-title'    { if ($d.title)   { $title = $d.title }   elseif ($d.content) { $title = $d.content } }
            'last-prompt' { if ($d.prompt)  { $lastPrompt = $d.prompt } elseif ($d.content) { $lastPrompt = (Get-BlockText $d.content) } }
            'user' {
                $txt = Get-BlockText $d.message.content
                if ($txt -and $txt -notmatch '^\s*<') { $turns.Add([pscustomobject]@{ Role = 'user'; Text = $txt }) }
            }
            'assistant' {
                $txt = Get-BlockText $d.message.content
                # Skip tool-only turns (e.g. just "[tool: Edit]") - they carry no handover
                # signal; keep only assistant messages with real prose.
                $clean = ($txt -replace '\[tool:[^\]]*\]', '').Trim()
                if ($clean) { $turns.Add([pscustomobject]@{ Role = 'assistant'; Text = $clean }) }
            }
        }
    }

    if (-not $title -and $lastPrompt) { $title = Truncate $lastPrompt 80 }
    if (-not $title -and $cwd) { $title = Split-Path $cwd -Leaf }
    if (-not $title) { $title = $File.BaseName }

    $recent = @($turns | Select-Object -Last $Tail)

    return [pscustomobject]@{
        SessionId  = $File.BaseName
        File       = $File.FullName
        Written    = $File.LastWriteTime
        Cwd        = $cwd
        Branch     = $branch
        Title      = $title
        LastPrompt = $lastPrompt
        Turns      = $recent
    }
}

function Get-GitRisk {
    # Live git state for the session's cwd - the state a receiver actually needs to know is
    # at risk (uncommitted / unpushed). Best-effort; a missing/removed cwd just yields $null.
    param([string]$Cwd)
    if (-not $Cwd -or -not (Test-Path $Cwd)) { return $null }
    try {
        $inside = (& git -C $Cwd rev-parse --is-inside-work-tree 2>$null)
        if ($inside -ne 'true') { return $null }
    } catch { return $null }
    $branch   = (& git -C $Cwd rev-parse --abbrev-ref HEAD 2>$null)
    $dirty    = @(& git -C $Cwd status --porcelain 2>$null)
    $unpushed = $null
    try { $unpushed = (& git -C $Cwd rev-list --count '@{u}..HEAD' 2>$null) } catch {}
    return [pscustomobject]@{
        Branch      = $branch
        DirtyCount  = $dirty.Count
        DirtySample = @($dirty | Select-Object -First 8)
        Unpushed    = $unpushed
    }
}

$parsed = foreach ($f in $files) { Parse-Session -File $f }

# One workspace can have several transcripts (a conversation resumed repeatedly leaves an
# older .jsonl behind each time). Collapse to the newest transcript per cwd+branch so the
# dump is one entry per live workspace, and record how many were folded in.
$sessions = foreach ($g in ($parsed | Group-Object { "$($_.Cwd)|$($_.Branch)" })) {
    $newest = $g.Group | Sort-Object Written -Descending | Select-Object -First 1
    $newest | Add-Member -NotePropertyName TranscriptCount -NotePropertyValue $g.Count -PassThru
}
$sessions = @($sessions | Sort-Object Written -Descending)

# --- Build markdown ---------------------------------------------------------------------
$now = Get-Date -Format 'yyyy-MM-dd HH:mm'
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Claude session dump - $now")
[void]$sb.AppendLine()
[void]$sb.AppendLine("$($sessions.Count) workspace(s) active in the last $SinceMinutes min (from $($files.Count) transcript(s)), newest first. Recovered from on-disk transcripts (survives power loss).")
[void]$sb.AppendLine()

foreach ($s in $sessions) {
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("## $($s.Title)")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("- **cwd:** ``$($s.Cwd)``")
    [void]$sb.AppendLine("- **branch (transcript):** ``$($s.Branch)``")
    [void]$sb.AppendLine("- **last activity:** $($s.Written.ToString('yyyy-MM-dd HH:mm'))")
    [void]$sb.AppendLine("- **session:** ``$($s.SessionId)`` -> resume with ``claude --resume $($s.SessionId)`` in the cwd")
    if ($s.TranscriptCount -gt 1) {
        [void]$sb.AppendLine("- <sub>($($s.TranscriptCount) transcripts for this workspace; showing the newest)</sub>")
    }

    $risk = Get-GitRisk -Cwd $s.Cwd
    if ($risk) {
        $unpushedTxt = if ($null -ne $risk.Unpushed) { $risk.Unpushed } else { '?' }
        [void]$sb.AppendLine("- **git now:** branch ``$($risk.Branch)`` - $($risk.DirtyCount) uncommitted file(s), $unpushedTxt unpushed commit(s)")
        if ($risk.DirtyCount -gt 0) {
            [void]$sb.AppendLine()
            [void]$sb.AppendLine('  <sub>uncommitted:</sub>')
            [void]$sb.AppendLine('  ```')
            foreach ($d in $risk.DirtySample) { [void]$sb.AppendLine("  $d") }
            if ($risk.DirtyCount -gt 8) { [void]$sb.AppendLine("  ... and $($risk.DirtyCount - 8) more") }
            [void]$sb.AppendLine('  ```')
        }
    }
    [void]$sb.AppendLine()

    if ($s.LastPrompt) {
        [void]$sb.AppendLine("**Last prompt:** $(Truncate $s.LastPrompt 400)")
        [void]$sb.AppendLine()
    }

    if ($s.Turns.Count -gt 0) {
        [void]$sb.AppendLine("**Last $($s.Turns.Count) turn(s):**")
        [void]$sb.AppendLine()
        foreach ($t in $s.Turns) {
            $who = if ($t.Role -eq 'user') { 'You' } else { 'Claude' }
            [void]$sb.AppendLine("- **${who}:** $(Truncate $t.Text 500)")
        }
        [void]$sb.AppendLine()
    }
}

$outDir = Split-Path -Path $OutputPath -Parent
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
Set-Content -Path $OutputPath -Value $sb.ToString() -Encoding utf8

# --- Report -----------------------------------------------------------------------------
Write-Output "Dumped $($sessions.Count) active session(s) to $OutputPath"
foreach ($s in $sessions) {
    $risk = Get-GitRisk -Cwd $s.Cwd
    $riskTxt = if ($risk) { "$($risk.DirtyCount) dirty / $($risk.Unpushed) unpushed" } else { 'no git' }
    Write-Output ("  - {0,-16} {1}  [{2}]" -f $s.Branch, $s.Title, $riskTxt)
}
