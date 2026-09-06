#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Symlink (junction) every skill in this repo into Claude Code and Codex.

.DESCRIPTION
    Single source of truth: each skill dir here is linked into the user's
    skills folders rather than copied, so editing the repo file IS editing the
    live skill. Idempotent and self-healing — run it after adding a skill, or
    to repair a machine whose agent skill folders have gaps or stale copies:

      - already linked correctly -> left alone  (=)
      - missing                  -> junction created  (+)
      - stale copy / wrong target-> replaced with a junction  (~)
      - junction into this repo whose target no longer exists -> removed  (-)

    A "skill" is any top-level directory containing a SKILL.md (so .git,
    .claude-plugin, archive, etc. are skipped automatically). Retiring a skill
    is therefore just `git mv <skill> archive/<skill>` followed by a re-run:
    the orphaned junction is pruned on the next pass.

    Pruning only ever touches junctions that point into THIS repo, so skills
    linked from elsewhere, or hand-made links, are left alone.

    Junctions need no admin rights and no developer mode. macOS/Linux users:
    see `ln -s` in README.md.

    It also offers to install the repo's own CLAUDE.md — the canonical global
    instruction file — to -ClaudeMdPath. See -ClaudeMd below; left unset it
    never prompts and never writes, so this half can never block an
    unattended run (a caller must pass -ClaudeMd Ask to be prompted at all);
    like the junction half above it never touches a file that already
    matches, and it always backs up before it writes.
#>
[CmdletBinding()]
param(
    # Override the destinations when testing or linking one harness only.
    [string[]]$Dest = @(
        (Join-Path $env:USERPROFILE '.claude\skills'),
        (Join-Path $env:USERPROFILE '.agents\skills')
    ),

    # How to reconcile the repo's CLAUDE.md with whatever is already at
    # -ClaudeMdPath: Skip, Replace, Append, Merge, or Ask (prompt for one of
    # the other four). Left unset, the default is unconditionally Skip —
    # never Ask — because there is no reliable way to tell from inside the
    # process whether reading stdin will ever return: a caller can hold a
    # live console handle while stdin is redirected to a pipe nobody writes
    # to or closes (the default shape when a .NET/Python/Node/agent caller
    # spawns this script with stdin redirected but silent), which would make
    # a guess-based default block forever instead of skipping. Only an
    # explicit -ClaudeMd Ask enters the prompt branch, and even then it falls
    # back to Skip off anything that isn't a real interactive console.
    [ValidateSet('Skip', 'Replace', 'Append', 'Merge', 'Ask')]
    [string]$ClaudeMd,

    # Override the CLAUDE.md destination when testing or targeting one file only.
    [string]$ClaudeMdPath = (Join-Path $env:USERPROFILE '.claude\CLAUDE.md')
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
foreach ($destination in $Dest) {
    New-Item -ItemType Directory -Force -Path $destination | Out-Null

    Get-ChildItem -Path $repo -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } |
        ForEach-Object {
            $target = $_.FullName
            $link   = Join-Path $destination $_.Name

            if (Test-Path $link) {
                $item = Get-Item $link -Force
                if ($item.LinkType -eq 'Junction' -and ($item.Target -contains $target)) {
                    "=  $($_.Name) ($destination)"
                    return
                }
                Remove-Item $link -Recurse -Force   # stale copy or wrong target
                $mark = '~'
            }
            else { $mark = '+' }

            New-Item -ItemType Junction -Path $link -Target $target | Out-Null
            "$mark  $($_.Name) ($destination)"
        }

    # Prune orphans only in this destination: junctions pointing into this repo
    # whose target no longer exists. Links pointing elsewhere are untouched.
    Get-ChildItem -Path $destination -Directory -Force |
        Where-Object { $_.LinkType -eq 'Junction' } |
        ForEach-Object {
            $tgt = @($_.Target)[0]
            if ($tgt -and $tgt.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path $tgt)) {
                Remove-Item $_.FullName -Recurse -Force
                "-  $($_.Name) ($destination)"
            }
        }
}

# --- CLAUDE.md installation ---------------------------------------------------------------
#
# Separate from the junction loop above: there is exactly one CLAUDE.md, installed by copy (or
# merge) rather than by junction, because unlike a skill it is meant to be edited in place once
# installed — a junction back into this repo would make a user's local edit a commit in this repo.

# True only when a human is plausibly at the far end of stdin and can answer a prompt. This is a
# console-presence check, not a "will reading stdin actually return" check, so it is used only as
# an extra guard inside the explicit -ClaudeMd Ask path below (never to pick a default): it can
# still say True for a process holding a live console handle whose stdin is a pipe nobody writes to
# or closes, which is why the unset-parameter default never routes through this function at all —
# see the -ClaudeMd parameter comment. $env:CI is the fast, reliable "definitely not interactive"
# signal every CI system sets (GitHub Actions included), checked first. UserInteractive and RawUI
# are the finer-grained fallback for a non-CI but still non-interactive invocation (an agent or
# script running this headlessly): RawUI throws or is unavailable off a real console.
function Test-ClaudeMdInteractive {
    if ($env:CI) { return $false }
    if (-not [Environment]::UserInteractive) { return $false }
    try {
        if (-not $Host.UI.RawUI) { return $false }
        $null = $Host.UI.RawUI.WindowSize
        return $true
    }
    catch {
        return $false
    }
}

# Copies the file currently at $ClaudeMdPath to a timestamped sibling before any Replace, Append
# or Merge overwrites it, and returns the backup path. This is the user's global agent
# configuration; losing it silently on a bad merge or a fat-fingered Replace is unacceptable.
function Backup-ClaudeMd {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
    $backup = "$ClaudeMdPath.bak-$stamp"
    Copy-Item -Path $ClaudeMdPath -Destination $backup -Force
    $backup
}

# Strips a single wrapping ```-fenced code block, in case the merge model added one despite being
# told not to — defensive, not load-bearing: the prompt already asks for raw content only.
function Remove-WrappingCodeFence {
    param([string]$Text)
    $lines = $Text -split "`n"
    if ($lines.Count -ge 2 -and $lines[0].TrimEnd() -match '^```' -and $lines[-1].Trim() -eq '```') {
        return ($lines[1..($lines.Count - 2)] -join "`n")
    }
    $Text
}

function Install-ClaudeMd {
    $repoClaudeMd = Join-Path $repo 'CLAUDE.md'
    if (-not (Test-Path $repoClaudeMd)) { return }  # nothing to offer
    New-Item -ItemType Directory -Force -Path (Split-Path $ClaudeMdPath -Parent) | Out-Null

    # Unset means Skip, full stop -- never Ask. Console presence can't tell us whether stdin will
    # ever produce a line (see the -ClaudeMd parameter comment and Test-ClaudeMdInteractive above),
    # so guessing here is exactly the bug: only a caller who writes -ClaudeMd Ask explicitly reaches
    # the prompt branch, and even then it still degrades to Skip off anything but a real console.
    $mode = if ($ClaudeMd) { $ClaudeMd } else { 'Skip' }
    if ($mode -eq 'Ask' -and -not (Test-ClaudeMdInteractive)) {
        "!  CLAUDE.md (non-interactive with -ClaudeMd Ask -- defaulting to Skip)"
        $mode = 'Skip'
    }

    $existing = Test-Path $ClaudeMdPath
    if ($existing -and (Get-FileHash -Path $repoClaudeMd -Algorithm SHA256).Hash -eq (Get-FileHash -Path $ClaudeMdPath -Algorithm SHA256).Hash) {
        "=  CLAUDE.md"
        return
    }

    if ($mode -eq 'Ask') {
        $question = if ($existing) {
            "CLAUDE.md at $ClaudeMdPath differs from this repo's. [S]kip/[R]eplace/[A]ppend/[M]erge (default S)"
        }
        else {
            "Install this repo's CLAUDE.md to $ClaudeMdPath`? [S]kip/[R]eplace (default S)"
        }
        $answer = Read-Host $question
        $mode = switch -Regex ($answer) {
            '^[Rr]' { 'Replace' }
            '^[Aa]' { 'Append' }
            '^[Mm]' { 'Merge' }
            default { 'Skip' }
        }
    }

    switch ($mode) {
        'Skip' {
            if ($existing) { "!  CLAUDE.md (differs from the repo's -- left untouched; re-run with -ClaudeMd Replace, Append or Merge to update)" }
            else { "!  CLAUDE.md (not installed; re-run with -ClaudeMd Replace to install)" }
        }

        'Replace' {
            if ($existing) {
                $backup = Backup-ClaudeMd
                Copy-Item -Path $repoClaudeMd -Destination $ClaudeMdPath -Force
                "~  CLAUDE.md (replaced; existing file backed up to $backup)"
            }
            else {
                Copy-Item -Path $repoClaudeMd -Destination $ClaudeMdPath -Force
                "+  CLAUDE.md"
            }
        }

        'Append' {
            if ($existing) {
                $backup = Backup-ClaudeMd
                $separator = "`n`n<!-- ---- appended from $repoClaudeMd by link-skills.ps1 on $(Get-Date -Format 'yyyy-MM-dd') ---- -->`n`n"
                $combined = (Get-Content -Path $ClaudeMdPath -Raw) + $separator + (Get-Content -Path $repoClaudeMd -Raw)
                Set-Content -Path $ClaudeMdPath -Value $combined -NoNewline
                "~  CLAUDE.md (appended; existing file backed up to $backup)"
            }
            else {
                Copy-Item -Path $repoClaudeMd -Destination $ClaudeMdPath -Force
                "+  CLAUDE.md"
            }
        }

        'Merge' {
            if (-not $existing) {
                Copy-Item -Path $repoClaudeMd -Destination $ClaudeMdPath -Force
                "+  CLAUDE.md"
                return
            }

            if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
                "!  CLAUDE.md (merge skipped: 'claude' CLI not found on PATH -- existing file untouched; re-run with -ClaudeMd Replace or Append instead)"
                return
            }

            $mergePrompt = @"
Merge these two CLAUDE.md files for Claude Code into a single file. Keep every rule from both
files. Drop duplicates. Where the two conflict, preserve FILE A's (the existing file's) intent.
Reply with ONLY the merged file's raw content: no explanation, no code fence, no preamble.

--- FILE A (existing, at $ClaudeMdPath) ---
$(Get-Content -Path $ClaudeMdPath -Raw)

--- FILE B (this repo's CLAUDE.md, at $repoClaudeMd) ---
$(Get-Content -Path $repoClaudeMd -Raw)
"@
            $mergeOutput = ($mergePrompt | & claude -p 2>&1 | Out-String)
            $mergeExit = $LASTEXITCODE
            if ($mergeExit -ne 0 -or [string]::IsNullOrWhiteSpace($mergeOutput)) {
                $snippet = $mergeOutput.Trim() -replace '\s+', ' '
                if ($snippet.Length -gt 300) { $snippet = $snippet.Substring(0, 300) + '...' }
                "!  CLAUDE.md (merge failed: 'claude -p' exited $mergeExit -- existing file untouched; re-run with -ClaudeMd Replace or Append instead)"
                if ($snippet) { "   claude said: $snippet" }
                return
            }

            $merged = Remove-WrappingCodeFence -Text $mergeOutput.TrimEnd("`r", "`n")
            if (Test-ClaudeMdInteractive) {
                "--- merged CLAUDE.md, not yet written ---"
                $merged
                "--- end of merged CLAUDE.md ---"
                $confirm = Read-Host "Write this merged result to $ClaudeMdPath`? [y/N]"
                if ($confirm -notmatch '^[Yy]') {
                    "!  CLAUDE.md (merge produced but declined -- existing file untouched)"
                    return
                }
            }
            $backup = Backup-ClaudeMd
            Set-Content -Path $ClaudeMdPath -Value $merged -NoNewline
            "~  CLAUDE.md (merged; existing file backed up to $backup)"
        }
    }
}

Install-ClaudeMd
