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
#>
[CmdletBinding()]
param(
    # Override the destinations when testing or linking one harness only.
    [string[]]$Dest = @(
        (Join-Path $env:USERPROFILE '.claude\skills'),
        (Join-Path $env:USERPROFILE '.agents\skills')
    )
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
