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
      - junction into this repo whose target no longer exists -> removed  (-)

    A "skill" is any top-level directory containing a SKILL.md (so .git,
    .claude-plugin, archive, etc. are skipped automatically). Retiring a skill
    is therefore just `git mv <skill> archive/<skill>` followed by a re-run:
    the orphaned junction is pruned on the next pass.

    Pruning only ever touches junctions that point into THIS repo, so skills
    linked from elsewhere (~/.agents/skills, or hand-made links) are left alone.

    Junctions need no admin rights and no developer mode. macOS/Linux users:
    see `ln -s` in README.md.
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

# Prune orphans: junctions in $Dest that point into this repo at a path that no
# longer exists (a skill moved to archive/, renamed, or deleted). Links pointing
# anywhere else are none of our business.
Get-ChildItem -Path $Dest -Directory -Force |
    Where-Object { $_.LinkType -eq 'Junction' } |
    ForEach-Object {
        $tgt = @($_.Target)[0]
        if ($tgt -and $tgt.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path $tgt)) {
            Remove-Item $_.FullName -Recurse -Force
            "-  $($_.Name)"
        }
    }
