#!/usr/bin/env pwsh
#requires -Version 7
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WhatsNext.psm1') -Force -DisableNameChecking

$script:fail = 0
$script:total = 0

function check {
    param([string]$Name, $Expected, $Actual)
    $script:total++
    if ($Expected -eq $Actual) { "  ok   $Name" }
    else { $script:fail++; "  FAIL $Name -- expected '$Expected', got '$Actual'" }
}

function git_ { git @args 2>&1 | Out-Null }

# A throwaway remote plus a clone, so "merged", "upstream gone" and "unpushed" are real git states
# rather than stubs. The predicate's whole job is reading real git, so mocks would certify nothing.
function New-Fixture {
    $base = Join-Path ([IO.Path]::GetTempPath()) ('wn-t-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $remote = Join-Path $base 'remote'
    $repo = Join-Path $base 'repo'
    New-Item -ItemType Directory $remote -Force | Out-Null
    git_ init --bare -b main $remote
    git_ clone $remote $repo
    git_ -C $repo config user.email 'test@example.invalid'
    git_ -C $repo config user.name 'test'
    'ignore-me/' | Set-Content -LiteralPath (Join-Path $repo '.gitignore')
    'one' | Set-Content -LiteralPath (Join-Path $repo 'file.txt')
    git_ -C $repo add -A
    git_ -C $repo commit -m 'initial'
    git_ -C $repo push -u origin main
    [pscustomobject]@{ Base = $base; Remote = $remote; Repo = $repo }
}

function Add-Branchy {
    param($Fx, [string]$Branch, [string]$Dir, [switch]$Push, [switch]$MergeToMain)
    $path = Join-Path $Fx.Base $(if ($Dir) { $Dir } else { $Branch.Replace('/', '-') })
    git_ -C $Fx.Repo worktree add -b $Branch $path main
    "content of $Branch" | Set-Content -LiteralPath (Join-Path $path 'work.txt')
    git_ -C $path add -A
    git_ -C $path commit -m "work on $Branch"
    if ($Push) { git_ -C $path push -u origin $Branch }
    if ($MergeToMain) {
        git_ -C $Fx.Repo merge --no-ff -m "merge $Branch" $Branch
        git_ -C $Fx.Repo push origin main
    }
    $path
}

function Verdict {
    param([string]$Path, [string]$Ref = 'origin/main', [string[]]$Merged = @(), [switch]$AllowIgnored)
    Test-WorktreeRemovable -Fact (Get-WorktreeFact -Path $Path) -DefaultRef $Ref -MergedHeads $Merged -AllowIgnored:$AllowIgnored
}

# ---------------------------------------------------------------------------------------
"prune predicate"
$fx = New-Fixture
try {
    $merged = Add-Branchy $fx 'merged-clean' -Push -MergeToMain
    check 'merged and clean is removable' $true (Verdict $merged).Removable

    # Dirty beats merged. The branch is fully landed, so every "is it merged" signal says yes, and
    # the uncommitted file would still be gone.
    $dirtyMerged = Add-Branchy $fx 'dirty-merged' -Push -MergeToMain
    'uncommitted edit' | Add-Content -LiteralPath (Join-Path $dirtyMerged 'work.txt')
    check 'dirty on a merged branch is NOT removable' $false (Verdict $dirtyMerged).Removable
    check 'dirty reports why' 'uncommitted changes' (Verdict $dirtyMerged).Reason

    $untracked = Add-Branchy $fx 'untracked-merged' -Push -MergeToMain
    'scratch notes nobody committed' | Set-Content -LiteralPath (Join-Path $untracked 'notes.txt')
    check 'untracked-only on a merged branch is NOT removable' $false (Verdict $untracked).Removable

    $ignored = Add-Branchy $fx 'ignored-merged' -Push -MergeToMain
    New-Item -ItemType Directory -Path (Join-Path $ignored 'ignore-me') -Force | Out-Null
    'local settings nobody can regenerate' | Set-Content -LiteralPath (Join-Path $ignored 'ignore-me/settings.json')
    check 'a clean worktree holding ignored files is NOT removable' $false (Verdict $ignored).Removable
    check 'ignored reports why' 'ignored files present' (Verdict $ignored).Reason
    check 'and goes only when explicitly allowed' $true (Verdict $ignored -AllowIgnored).Removable

    $unpushed = Add-Branchy $fx 'never-pushed'
    check 'unpushed and unmerged is NOT removable' $false (Verdict $unpushed).Removable

    $gone = Add-Branchy $fx 'gone-upstream' -Push
    git_ -C $fx.Remote update-ref -d refs/heads/gone-upstream
    git_ -C $fx.Repo fetch --prune
    check 'gone upstream is detected' $true (Get-WorktreeFact -Path $gone).UpstreamGone
    check 'gone upstream holding unique commits is NOT removable' $false (Verdict $gone).Removable
    check 'gone upstream reports why' 'unmerged commits' (Verdict $gone).Reason

    $squashed = Add-Branchy $fx 'squashed' -Push
    git_ -C $fx.Repo merge --squash squashed
    git_ -C $fx.Repo commit -m 'squashed landing'
    git_ -C $fx.Repo push origin main
    check 'a squash-merged branch is not an ancestor, so alone it is NOT removable' $false (Verdict $squashed).Removable
    check 'but is removable once the forge says its pull request merged' $true (Verdict $squashed -Merged @('squashed')).Removable
    check 'and reports that as the reason' 'merged pull request' (Verdict $squashed -Merged @('squashed')).Reason
    check 'another branch name in that list does not release it' $false (Verdict $squashed -Merged @('something-else')).Removable

    # THE catastrophic case from the real data: a detached worktree holding a commit on no branch.
    $detachedUnique = Join-Path $fx.Base 'detached-unique'
    git_ -C $fx.Repo worktree add --detach $detachedUnique main
    'only copy of this work' | Set-Content -LiteralPath (Join-Path $detachedUnique 'orphan.txt')
    git_ -C $detachedUnique add -A
    git_ -C $detachedUnique commit -m 'commit that lives only here'
    check 'detached with a unique commit is NOT removable' $false (Verdict $detachedUnique).Removable
    check 'and no merged-head list can release it, because it has no branch' $false (Verdict $detachedUnique -Merged @('main', 'squashed')).Removable

    $detachedMerged = Join-Path $fx.Base 'detached-merged'
    git_ -C $fx.Repo worktree add --detach $detachedMerged 'origin/main'
    check 'detached at an ancestor of the default branch is removable' $true (Verdict $detachedMerged).Removable

    check 'the main worktree is NOT removable' $false (Verdict $fx.Repo).Removable
    check 'main worktree reports why' 'main worktree' (Verdict $fx.Repo).Reason

    $locked = Add-Branchy $fx 'locked-merged' -Push -MergeToMain
    git_ -C $fx.Repo worktree lock $locked
    check 'a locked worktree is NOT removable' $false (Verdict $locked).Removable
    check 'locked reports why' 'locked' (Verdict $locked).Reason
    git_ -C $fx.Repo worktree unlock $locked

    check 'no default branch means NOT removable' $false (Verdict $merged -Ref $null).Removable
    check 'no default branch reports why' 'no default branch' (Verdict $merged -Ref $null).Reason
    check 'a default branch that does not resolve is refused too' $false (Verdict $merged -Ref 'origin/nope').Removable

    # A stash leaves the working tree clean, so nothing else in the predicate notices it.
    $stashed = Add-Branchy $fx 'stashed-merged' -Push -MergeToMain
    'work in progress' | Add-Content -LiteralPath (Join-Path $stashed 'work.txt')
    git_ -C $stashed stash push -m 'wip'
    check 'a stash leaves the worktree reading clean' $false (Get-WorktreeFact -Path $stashed).Dirty
    check 'so the stashed worktree is removable, and the skill must say the stash survives' $true (Verdict $stashed).Removable

    # Paths with spaces and brackets are ordinary on Windows and are where naive quoting breaks.
    $awkward = Add-Branchy $fx 'awkward/branch' -Dir 'has space [and] brackets' -Push -MergeToMain
    check 'a path with a space and brackets is read correctly' $true (Verdict $awkward).Removable

    $vanished = Add-Branchy $fx 'vanished' -Push -MergeToMain
    Remove-Item -LiteralPath $vanished -Recurse -Force
    check 'a missing directory is reported, not crashed on' $true (Get-WorktreeFact -Path $vanished).Missing
    check 'and is NOT removable' $false (Verdict $vanished).Removable

    # git prints nothing and exits 128 on a broken pointer; "output was empty" would read as clean.
    $broken = Add-Branchy $fx 'broken-pointer' -Push -MergeToMain
    'gitdir: C:/nowhere/at/all' | Set-Content -LiteralPath (Join-Path $broken '.git')
    check 'a stale .git pointer is NOT removable' $false (Verdict $broken).Removable
    check 'a stale .git pointer reports as missing, not clean' 'directory missing' (Verdict $broken).Reason

    "facts"
    check 'detached is recognised' $true (Get-WorktreeFact -Path $detachedUnique).Detached
    check 'detached has no branch' $null (Get-WorktreeFact -Path $detachedUnique).Branch
    check 'ignored files are counted apart from dirty ones' 0 (Get-WorktreeFact -Path $ignored).DirtyCount
}
finally {
    git_ -C $fx.Repo worktree prune
    Remove-Item -LiteralPath $fx.Base -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------------------
"pull request ranking"
function Pr {
    param([hashtable]$Overrides)
    $pr = @{ IsDraft = $false; Unresolved = 0; Decision = ''; Rollup = 'SUCCESS'; Mergeable = 'MERGEABLE' }
    foreach ($k in $Overrides.Keys) { $pr[$k] = $Overrides[$k] }
    [pscustomobject]$pr
}
check 'green and mergeable is rank 1' 1 (Get-PullRequestRank -PullRequest (Pr @{}))
check 'an unresolved thread outranks green' 2 (Get-PullRequestRank -PullRequest (Pr @{ Unresolved = 1 }))
check 'changes requested is rank 2' 2 (Get-PullRequestRank -PullRequest (Pr @{ Decision = 'CHANGES_REQUESTED' }))
check 'an unresolved thread beats an empty decision' 2 (Get-PullRequestRank -PullRequest (Pr @{ Unresolved = 3; Decision = '' }))
check 'a draft is not on the board' $null (Get-PullRequestRank -PullRequest (Pr @{ IsDraft = $true }))
check 'a failing check is not ready to merge' $null (Get-PullRequestRank -PullRequest (Pr @{ Rollup = 'FAILURE' }))
check 'a pending check is not ready to merge' $null (Get-PullRequestRank -PullRequest (Pr @{ Rollup = 'PENDING' }))
check 'no checks configured is not a failure' 1 (Get-PullRequestRank -PullRequest (Pr @{ Rollup = $null }))
check 'a conflicted branch is not ready to merge' $null (Get-PullRequestRank -PullRequest (Pr @{ Mergeable = 'CONFLICTING' }))
check 'a required review still outstanding is not ready' $null (Get-PullRequestRank -PullRequest (Pr @{ Decision = 'REVIEW_REQUIRED' }))

# ---------------------------------------------------------------------------------------
"repository ordering"
$items = @(
    [pscustomobject]@{ Repo = 'beta'; Rank = 1 }
    [pscustomobject]@{ Repo = 'alpha'; Rank = 4 }
    [pscustomobject]@{ Repo = 'alpha'; Rank = 6 }
    [pscustomobject]@{ Repo = 'beta'; Rank = 7 }
)
$ordered = @(Sort-BoardItem -Items $items)
check 'the hottest repository comes first' 'beta' $ordered[0].Repo
check 'its own items stay together' 'beta' $ordered[1].Repo
check 'the cooler repository follows whole' 'alpha' $ordered[2].Repo
check 'and is internally ranked' 4 $ordered[2].Rank

# ---------------------------------------------------------------------------------------
"transcript fallback degrades"
check 'an unparseable line yields nothing rather than an error' $null (Read-TranscriptHint -Line 'not json at all')
check 'json without the expected fields yields nothing' $null (Read-TranscriptHint -Line '{"unexpected":"shape"}')
check 'a json array yields nothing' $null (Read-TranscriptHint -Line '[1,2,3]')
check 'an empty line yields nothing' $null (Read-TranscriptHint -Line '')
check 'a recognised line still yields the working directory' 'C:\x' (Read-TranscriptHint -Line '{"cwd":"C:\\x","sessionId":"abc"}').Cwd

# ---------------------------------------------------------------------------------------
"offline and remoteless repositories still produce a board"
$repo = [pscustomobject]@{ Name = 'local-only'; Root = 'C:\nowhere'; Slug = $null; Worktrees = @() }
$offline = @(Get-RepositoryBoardItem -Repo $repo -Remote $null -NewestSession @{} -LiveHere @{} -StaleDays 7)
check 'a repository with no remote data yields no items and no error' 0 $offline.Count

# ---------------------------------------------------------------------------------------
""
if ($script:fail -gt 0) { "FAILED $script:fail of $script:total"; exit 1 }
"passed $script:total checks"
