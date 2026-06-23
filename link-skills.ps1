#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Symlink (junction) every skill in this repo into ~/.claude/skills.

.DESCRIPTION
    Single source of truth: each skill dir here is linked into the user's
    skills folder rather than copied, so editing the repo file IS editing the
    live skill. Idempotent and self-healing — run it after adding a skill, or
    to repair a machine whose ~/.claude/skills has gaps or stale copies:

      - already linked correctly -> left alone  (=)
      - missing                  -> junction created  (+)
      - stale copy / wrong target-> replaced with a junction  (~)

    A "skill" is any top-level directory containing a SKILL.md (so .git,
    .claude-plugin, etc. are skipped automatically). Junctions need no admin
    rights and no developer mode. macOS/Linux users: see `ln -s` in README.md.
#>
[CmdletBinding()]
param(
    # Where to create the links. Defaults to the user's Claude Code skills dir.
    [string]$Dest = (Join-Path $env:USERPROFILE '.claude\skills')
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Get-ChildItem -Path $repo -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } |
    ForEach-Object {
        $target = $_.FullName
        $link   = Join-Path $Dest $_.Name

        if (Test-Path $link) {
            $item = Get-Item $link -Force
            if ($item.LinkType -eq 'Junction' -and ($item.Target -contains $target)) {
                "=  $($_.Name)"
                return
            }
            Remove-Item $link -Recurse -Force   # stale copy or wrong target
            $mark = '~'
        }
        else { $mark = '+' }

        New-Item -ItemType Junction -Path $link -Target $target | Out-Null
        "$mark  $($_.Name)"
    }
