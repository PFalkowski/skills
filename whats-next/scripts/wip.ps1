#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Prints one ranked board of what to work on next across every repository you have been active in,
  and puts you into the item you pick.

.DESCRIPTION
  Joins four things no built-in view combines: open pull requests with their review and check
  state, every git worktree with its dirty / ahead / age facts, live Claude Code sessions, and
  prompt backlog files. Items are grouped by repository, and the repositories are ordered by their
  own hottest item, so a pull request waiting on you cannot hide behind routine work elsewhere.

  Costs no model tokens. Run it from any terminal.

.PARAMETER Item
  Omit to print the board. A number launches that item. The word 'prune' proposes dead worktrees.

.PARAMETER Apply
  With 'prune', actually remove the proposed worktrees. Without it, prune only reports.

.PARAMETER IncludeIgnored
  With 'prune', also consider worktrees holding ignored files. `git worktree remove` deletes those
  without warning, and ignored is where local configuration and skill state live, so they are held
  back unless you ask for them.

.PARAMETER Fetch
  Before pruning, run `git fetch --prune` per repository. Costs a network round trip per repository.

.PARAMETER SinceDays
  How far back a transcript counts as recent activity when deriving the repository list.

.PARAMETER StaleDays
  How old a worktree's last commit must be before it is listed as a cleanup candidate.

.PARAMETER PerRank
  How many items of the same rank to show per repository before collapsing the rest into a count.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Item,
    [switch]$Apply,
    [switch]$IncludeIgnored,
    [switch]$Fetch,
    [int]$SinceDays = 14,
    [int]$StaleDays = 7,
    [int]$PerRank = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WhatsNext.psm1') -Force -DisableNameChecking

$stateRoot = if ($env:AGENTS_STATE) { Join-Path $env:AGENTS_STATE 'whats-next' } else { Join-Path $HOME '.agents/whats-next' }
$boardFile = Join-Path $stateRoot 'board.json'
$marks = @{ 1 = 'MERGE'; 2 = 'REVIEW'; 3 = 'NO PR'; 4 = 'AT RISK'; 5 = 'ASKED'; 6 = 'BACKLOG'; 7 = 'STALE' }

function Select-Shown {
    param($Items)
    $shown = [System.Collections.Generic.List[object]]::new()
    $hidden = @{}
    $count = @{}
    foreach ($entry in $Items) {
        $key = "$($entry.Repo)|$($entry.Rank)"
        $count[$key] = 1 + $(if ($count.ContainsKey($key)) { $count[$key] } else { 0 })
        if ($count[$key] -le $PerRank) { $shown.Add($entry) }
        else { $hidden[$entry.Repo] = 1 + $(if ($hidden.ContainsKey($entry.Repo)) { $hidden[$entry.Repo] } else { 0 }) }
    }
    [pscustomobject]@{ Shown = @($shown); Hidden = $hidden }
}

function Show-Board {
    $all = @(Get-Board -SinceDays $SinceDays -StaleDays $StaleDays)
    if ($all.Count -eq 0) {
        'Nothing to pick up. No recent activity, open pull requests, or worktrees needing attention.'
        return
    }
    $selection = Select-Shown -Items $all
    $items = $selection.Shown

    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    $items | Select-Object Repo, RepoRoot, Rank, Kind, Label, Path, Branch, SessionId, Url, AlreadyOpen |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $boardFile -Encoding utf8

    $currentRepo = $null
    for ($i = 0; $i -lt $items.Count; $i++) {
        $entry = $items[$i]
        if ($entry.Repo -ne $currentRepo) {
            if ($currentRepo -and $selection.Hidden.ContainsKey($currentRepo)) {
                "        {0,-8}  ... and {1} more" -f '', $selection.Hidden[$currentRepo]
            }
            $currentRepo = $entry.Repo
            ''
            "  $currentRepo"
        }
        $where = if ($entry.Branch) { $entry.Branch } else { Split-Path $entry.Path -Leaf }
        if ($entry.AlreadyOpen) { $where += '   [a session is already open here]' }
        '{0,4}  {1,-8}  {2}' -f ($i + 1), $marks[$entry.Rank], $entry.Label
        '        {0,-8}  {1}' -f '', $where
    }
    if ($currentRepo -and $selection.Hidden.ContainsKey($currentRepo)) {
        "        {0,-8}  ... and {1} more" -f '', $selection.Hidden[$currentRepo]
    }
    ''
    '  wip <n> to go there.  wip prune to clear dead worktrees.'
}

function Start-Item {
    param([int]$Number)
    if (-not (Test-Path -LiteralPath $boardFile)) { throw 'No board yet. Run wip first.' }
    $items = @(Get-Content -LiteralPath $boardFile -Raw | ConvertFrom-Json)
    if ($Number -lt 1 -or $Number -gt $items.Count) { throw "Pick a number between 1 and $($items.Count)." }
    $entry = $items[$Number - 1]

    if (-not (Test-Path -LiteralPath $entry.Path -PathType Container)) {
        throw "$($entry.Path) is gone. Run wip to rebuild the board."
    }

    $label = if ($entry.Branch) { "$($entry.Repo) $($entry.Branch)" } else { "$($entry.Repo) $($entry.Kind)" }
    Set-Location -LiteralPath $entry.Path

    if ($entry.SessionId) {
        "-> $($entry.Path)  (resuming $($entry.SessionId))"
        & claude -r $entry.SessionId -n $label
    }
    else {
        "-> $($entry.Path)  (new session)"
        & claude -n $label
    }
}

function Invoke-Prune {
    $live = @(Get-LiveSession)
    $repos = @(Get-RepositoryGroup -Directories (Get-CandidateDirectory -TranscriptSessions (Get-TranscriptSession -SinceDays $SinceDays) -LiveSessions $live))

    $rows = foreach ($repo in $repos) {
        if ($Fetch) { & git -C $repo.Root fetch --prune --quiet 2>$null }
        Get-PruneCandidate -Repo $repo -Remote (Get-RepositoryPullRequest -Slug $repo.Slug) -LiveSessions $live -AllowIgnored:$IncludeIgnored
    }
    $rows = @($rows)
    $removable = @($rows | Where-Object { $_.Removable })
    $holdingWork = @($rows | Where-Object { $_.Reason -in @('uncommitted changes', 'unmerged commits', 'ignored files present') })

    if (-not $Fetch) {
        'Branches deleted on the remote are recognised only as far as your last fetch. Add -Fetch to refresh.'
        ''
    }
    if ($removable.Count -eq 0) { "Nothing safe to remove. $($rows.Count) worktree(s) examined." }
    else {
        "$($removable.Count) worktree(s) safe to remove:"
        foreach ($row in $removable) { '  {0,-24} {1}  ({2})' -f $row.Repo, $row.Path, $row.Reason }
    }
    ''
    if ($holdingWork.Count -gt 0) {
        "$($holdingWork.Count) kept because removing them would destroy something:"
        foreach ($row in $holdingWork) { '  {0,-24} {1}  ({2})' -f $row.Repo, $row.Path, $row.Reason }
        ''
    }

    if (-not $Apply) {
        "Nothing was removed. Re-run with -Apply to remove the $($removable.Count) listed above."
        return
    }
    foreach ($row in $removable) {
        # Never --force. git's own refusal is the last guard standing if a worktree turned dirty
        # between the check above and this line.
        & git -C $row.Root worktree remove $row.Path 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { "removed $($row.Path)" }
        elseif (Test-Path -LiteralPath $row.Path) { "git refused, left alone: $($row.Path)" }
        else {
            # Windows can delete the files, lose the administrative entry, and still fail. Saying
            # "removed" there would be a lie, and saying nothing leaves an orphan nobody looks for.
            "REMOVAL FAILED PART WAY, an empty directory may remain: $($row.Path)"
        }
    }
}

if (-not $Item) { Show-Board }
elseif ($Item -eq 'prune') { Invoke-Prune }
elseif ($Item -match '^\d+$') { Start-Item -Number ([int]$Item) }
else { throw 'Usage: wip | wip <n> | wip prune [-Apply] [-IncludeIgnored] [-Fetch]' }
