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
    param(
        [string]$Path, [string]$Ref = 'origin/main', [string[]]$Merged = @(),
        [string]$MergedOid, [string[]]$LiveSessions = @(), [switch]$AllowIgnored
    )
    $fact = Get-WorktreeFact -Path $Path
    $heads = @($Merged | ForEach-Object {
        [pscustomobject]@{ Head = $_; Oid = $(if ($MergedOid) { $MergedOid } else { $fact.HeadOid }) }
    })
    Test-WorktreeRemovable -Fact $fact -DefaultRef $Ref -MergedHeads $heads `
        -LiveSessionPaths $LiveSessions -AllowIgnored:$AllowIgnored
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
    check 'the same branch name at a different commit does not release it' $false (Verdict $squashed -Merged @('squashed') -MergedOid ('0' * 40)).Removable
    check 'a name match on the wrong commit reports unmerged commits' 'unmerged commits' (Verdict $squashed -Merged @('squashed') -MergedOid ('0' * 40)).Reason

    $neverPushed = Add-Branchy $fx 'never-pushed'
    check 'a branch that was never pushed cannot match a merged pull request' $false (Verdict $neverPushed -Merged @('never-pushed')).Removable

    check 'a worktree with a session open in it is NOT removable' $false (Verdict $merged -LiveSessions @($merged)).Removable
    check 'and reports the open session as the reason' 'session open here' (Verdict $merged -LiveSessions @($merged)).Reason

    $bisecting = Add-Branchy $fx 'bisecting' -Push -MergeToMain
    check 'the bisect fixture is removable before the bisect starts' $true (Verdict $bisecting).Removable
    git_ -C $bisecting bisect start
    check 'a worktree mid-bisect is NOT removable' $false (Verdict $bisecting).Removable
    check 'and reports the operation as the reason' 'operation in progress' (Verdict $bisecting).Reason
    git_ -C $bisecting bisect reset

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

    # A linked worktree sitting on the default branch itself is trivially its own ancestor, so
    # the merge check alone would call it "merged" and offer to delete a deliberately kept checkout.
    $onDefault = Join-Path $fx.Base 'on-default-branch'
    git_ -C $fx.Repo worktree add --force $onDefault main
    check 'a linked worktree on the default branch is NOT removable' $false (Verdict $onDefault).Removable
    check 'and reports why' 'default branch' (Verdict $onDefault).Reason

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
    $pr = @{
        IsDraft = $false; Unresolved = 0; Decision = ''; Rollup = 'SUCCESS'; Mergeable = 'MERGEABLE'
        Number = 1; Title = 'synthetic pr'; Head = $null; Url = 'https://example.invalid/pr/1'
    }
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
# Get-RepositoryBoardItem's own suite call (below) passes an empty worktree list, so nothing
# above exercises the rung bodies themselves. These do, against real worktrees.
"board ranking ladder"

function P { param($Obj, [string]$Name) if ($null -ne $Obj) { $Obj.$Name } else { $null } }

function Set-CommitAge {
    param([string]$Path, [int]$DaysAgo)
    $date = (Get-Date).AddDays(-$DaysAgo).ToString('o')
    $env:GIT_COMMITTER_DATE = $date
    $env:GIT_AUTHOR_DATE = $date
    git_ -C $Path commit --amend --no-edit --date=$date
    Remove-Item Env:\GIT_COMMITTER_DATE, Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
}

$fx2 = New-Fixture
try {
    function Board {
        param([string[]]$Worktrees, [object[]]$PullRequests = @(), $NewestSession = @{}, $LiveHere = @{}, [int]$StaleDays = 7, [switch]$NoRemote)
        $repo = [pscustomobject]@{ Name = 'r'; Root = $fx2.Repo; Worktrees = @($Worktrees) }
        $remote = if ($NoRemote) { $null } else { [pscustomobject]@{ PullRequests = @($PullRequests) } }
        @(Get-RepositoryBoardItem -Repo $repo -Remote $remote -NewestSession $NewestSession -LiveHere $LiveHere -StaleDays $StaleDays)
    }

    # G4: a worktree whose PR is ready to merge is ALSO dirty, the exact real-data shape that
    # produced a second row, because `continue` inside a `switch` exits the switch, not the loop.
    $w1 = Add-Branchy $fx2 'ready-and-dirty' -Push
    'more work' | Add-Content -LiteralPath (Join-Path $w1 'work.txt')
    $items = Board -Worktrees @($w1) -PullRequests @((Pr @{ Head = 'ready-and-dirty'; Number = 101 }))
    check 'a worktree with a ready pull request yields exactly one board item, even when dirty' 1 $items.Count
    check 'and that one item is the pull request, not the dirty fallthrough' 'pr-ready' (P (Select-Object -InputObject $items -First 1) 'Kind')

    # Plain rank 1, no complications.
    $w2 = Add-Branchy $fx2 'ready-1' -Push
    $items = Board -Worktrees @($w2) -PullRequests @((Pr @{ Head = 'ready-1'; Number = 102 }))
    check 'a green mergeable pull request is rank 1' 1 (P ($items | Select-Object -First 1) 'Rank')

    # Rank 2, one worktree per reason, each labelled distinctly (G9 folds conflicts and failing
    # checks in here too; a PR "waiting on you" for any of these four reasons is not absent).
    $w3 = Add-Branchy $fx2 'needs-review' -Push
    $items = Board -Worktrees @($w3) -PullRequests @((Pr @{ Head = 'needs-review'; Number = 103; Unresolved = 2 }))
    check 'unresolved review threads is rank 2' 2 (P ($items | Select-Object -First 1) 'Rank')
    check 'and names the unresolved threads' $true ((P ($items | Select-Object -First 1) 'Label') -like '*unresolved thread*')

    $w4 = Add-Branchy $fx2 'changes-requested' -Push
    $items = Board -Worktrees @($w4) -PullRequests @((Pr @{ Head = 'changes-requested'; Number = 104; Decision = 'CHANGES_REQUESTED' }))
    check 'changes requested is rank 2' 2 (P ($items | Select-Object -First 1) 'Rank')

    $w5 = Add-Branchy $fx2 'conflicted' -Push
    $items = Board -Worktrees @($w5) -PullRequests @((Pr @{ Head = 'conflicted'; Number = 105; Mergeable = 'CONFLICTING' }))
    check 'a pull request with merge conflicts needs you, so rank 2, not absent from the board' 2 (P ($items | Select-Object -First 1) 'Rank')
    check 'and names the conflict' $true ((P ($items | Select-Object -First 1) 'Label') -like '*conflict*')

    $w6 = Add-Branchy $fx2 'checks-failing' -Push
    $items = Board -Worktrees @($w6) -PullRequests @((Pr @{ Head = 'checks-failing'; Number = 106; Rollup = 'FAILURE' }))
    check 'a pull request with failing checks needs you, so rank 2, not absent from the board' 2 (P ($items | Select-Object -First 1) 'Rank')
    check 'and names the failing checks' $true ((P ($items | Select-Object -First 1) 'Label') -like '*fail*')

    # A pull request that ranks nowhere (a required review still outstanding) still surfaces even
    # with no worktree checked out anywhere for it.
    $items = Board -Worktrees @() -PullRequests @((Pr @{ Head = 'orphan-conflicted'; Number = 109; Mergeable = 'CONFLICTING' }))
    check 'an orphaned conflicted pull request now surfaces, at rank 2' 2 (P ($items | Select-Object -First 1) 'Rank')
    $items = Board -Worktrees @() -PullRequests @((Pr @{ Head = 'orphan-ready'; Number = 110 }))
    check 'an orphaned ready pull request still surfaces with no worktree' 'pr-no-worktree' (P ($items | Select-Object -First 1) 'Kind')

    # Rank 3: pushed, no open pull request. G6 - when the forge was never consulted at all (no
    # slug, unauthenticated, rate-limited, offline), the row must not claim a fact it never
    # checked. G8 - the repository's own main checkout sitting on its own default branch must
    # never contribute this row; it can never become actionable and it is not excluded like rank 7.
    $w7 = Add-Branchy $fx2 'lonely-branch' -Push
    $items = Board -Worktrees @($w7)
    check 'pushed with no open pull request (forge consulted) is rank 3' 3 (P ($items | Select-Object -First 1) 'Rank')
    check 'and says so plainly' $true ((P ($items | Select-Object -First 1) 'Label') -like '*no pull request*')

    $w8 = Add-Branchy $fx2 'unknown-branch' -Push
    $items = Board -Worktrees @($w8) -NoRemote
    check 'when the forge was never consulted, the row still appears' 3 (P ($items | Select-Object -First 1) 'Rank')
    check 'labelled as unknown, not as a checked fact' $true ((P ($items | Select-Object -First 1) 'Label') -like '*unknown*')
    check 'and does not claim the one fact it never checked' $false ((P ($items | Select-Object -First 1) 'Label') -like '*no pull request*')

    $items = Board -Worktrees @($fx2.Repo)
    check 'the main worktree on its own default branch is never a rank-3 row' 0 $items.Count

    # Rank 4: uncommitted changes with nobody attending, and G12's clean-but-never-pushed commits,
    # ordered above the dirty items in the same rung.
    $w9 = Add-Branchy $fx2 'dirty-only'
    'edit' | Add-Content -LiteralPath (Join-Path $w9 'work.txt')
    $items = Board -Worktrees @($w9)
    check 'an unattended dirty worktree is rank 4' 4 (P ($items | Select-Object -First 1) 'Rank')
    check 'labelled dirty-at-risk' 'dirty-at-risk' (P ($items | Select-Object -First 1) 'Kind')

    $w10 = Add-Branchy $fx2 'committed-unpushed'
    $items = Board -Worktrees @($w10)
    check 'a clean branch with committed but never-pushed work is on the board' 4 (P ($items | Select-Object -First 1) 'Rank')
    check 'labelled as never pushed, not silently dropped' $true ((P ($items | Select-Object -First 1) 'Label') -like '*never*push*')

    $w11 = Add-Branchy $fx2 'unpushed-ordering'
    $w12 = Add-Branchy $fx2 'dirty-ordering'
    'edit' | Add-Content -LiteralPath (Join-Path $w12 'work.txt')
    $raw = Board -Worktrees @($w12, $w11)
    $sortedPair = @(Sort-BoardItem -Items $raw)
    check 'never-pushed sorts above dirty within the same rank' 'committed-unpushed' (P ($sortedPair | Select-Object -First 1) 'Kind')

    # Rank 5: a blocked background session takes priority over the never-pushed rung above it,
    # because someone is already attending to it.
    $w13 = Add-Branchy $fx2 'blocked-session'
    $normPath = $w13.TrimEnd('/', '\').ToLowerInvariant()
    $liveHere = @{ $normPath = [pscustomobject]@{ State = 'blocked'; SessionId = 'sess-123' } }
    $items = Board -Worktrees @($w13) -LiveHere $liveHere
    check 'a blocked background session is rank 5' 5 (P ($items | Select-Object -First 1) 'Rank')
    check 'labelled session-question' 'session-question' (P ($items | Select-Object -First 1) 'Kind')

    # Rank 6: backlog items. G5 - the real prompt-backlog skill writes `## [pending] [P#] Title`
    # headings, not checkboxes; both forms must be read.
    $w14 = Add-Branchy $fx2 'has-backlog-checkbox'
    New-Item -ItemType Directory (Join-Path $w14 'prompts') -Force | Out-Null
    @'
# Backlog
- [ ] first checkbox item
- [x] done item, not counted
'@ | Set-Content -LiteralPath (Join-Path $w14 'prompts/backlog.md')
    git_ -C $w14 add -A
    git_ -C $w14 commit -m 'add backlog'
    $items = Board -Worktrees @($w14)
    check 'a checkbox-style backlog is rank 6' 6 (P ($items | Select-Object -First 1) 'Rank')
    check 'and names the first pending item' $true ((P ($items | Select-Object -First 1) 'Label') -like '*first checkbox item*')

    $w15 = Add-Branchy $fx2 'has-backlog-heading'
    New-Item -ItemType Directory (Join-Path $w15 'prompts') -Force | Out-Null
    @'
# Backlog

## [pending] [P1] first heading item

some context
'@ | Set-Content -LiteralPath (Join-Path $w15 'prompts/backlog.md')
    git_ -C $w15 add -A
    git_ -C $w15 commit -m 'add backlog'
    $items = Board -Worktrees @($w15)
    check 'the real prompt-backlog [pending] heading format is rank 6' 6 (P ($items | Select-Object -First 1) 'Rank')
    check 'and names the first pending heading' $true ((P ($items | Select-Object -First 1) 'Label') -like '*first heading item*')

    $w16 = Add-Branchy $fx2 'backlog-all-done'
    New-Item -ItemType Directory (Join-Path $w16 'prompts') -Force | Out-Null
    '## [done] [P1] already finished' | Set-Content -LiteralPath (Join-Path $w16 'prompts/backlog.md')
    git_ -C $w16 add -A
    git_ -C $w16 commit -m 'add backlog'
    $items = Board -Worktrees @($w16)
    check 'a backlog with only done items yields no rank-6 item' 0 $items.Count

    # Rank 7: stale, with G10 - an open pull request, however it ranks, means the worktree is not
    # a cleanup candidate.
    $w17 = Add-Branchy $fx2 'stale-no-pr'
    Set-CommitAge -Path $w17 -DaysAgo 30
    $items = Board -Worktrees @($w17) -StaleDays 7
    check 'an old worktree with no pull request is stale' 7 (P ($items | Select-Object -First 1) 'Rank')
    check 'labelled stale' 'stale' (P ($items | Select-Object -First 1) 'Kind')

    $w18 = Add-Branchy $fx2 'stale-with-pr'
    Set-CommitAge -Path $w18 -DaysAgo 30
    $items = Board -Worktrees @($w18) -PullRequests @((Pr @{ Head = 'stale-with-pr'; Number = 107; Decision = 'REVIEW_REQUIRED' }))
    check 'an old worktree holding an open pull request is NOT a stale cleanup candidate' 0 $items.Count
}
finally {
    git_ -C $fx2.Repo worktree prune
    Remove-Item -LiteralPath $fx2.Base -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------------------
"repository ordering"
function Row {
    param([string]$Repo, [string]$RepoRoot, [int]$Rank, [string]$Kind = 'x', [string]$Path)
    [pscustomobject]@{
        Repo     = $Repo
        RepoRoot = if ($RepoRoot) { $RepoRoot } else { $Repo }
        Rank     = $Rank
        Kind     = $Kind
        Path     = if ($Path) { $Path } else { "$Repo-$Rank-$Kind" }
    }
}
$items = @(
    (Row 'beta' -RepoRoot 'root-beta' -Rank 1)
    (Row 'alpha' -RepoRoot 'root-alpha' -Rank 4)
    (Row 'alpha' -RepoRoot 'root-alpha' -Rank 6)
    (Row 'beta' -RepoRoot 'root-beta' -Rank 7)
)
$ordered = @(Sort-BoardItem -Items $items)
check 'the hottest repository comes first' 'beta' $ordered[0].Repo
check 'its own items stay together' 'beta' $ordered[1].Repo
check 'the cooler repository follows whole' 'alpha' $ordered[2].Repo
check 'and is internally ranked' 4 $ordered[2].Rank

# ---------------------------------------------------------------------------------------
# G15: the board's input arrives unordered (Get-WorktreeFactSet runs in parallel), so a sort with
# no total order rotates which items are hidden between otherwise-identical runs.
"deterministic sort"
$dup = @(
    (Row 'gamma' -Rank 4 -Path 'C:\gamma\z')
    (Row 'gamma' -Rank 4 -Path 'C:\gamma\a')
    (Row 'gamma' -Rank 4 -Path 'C:\gamma\m')
)
$forward = @(Sort-BoardItem -Items $dup) | ForEach-Object { $_.Path }
$reversed = @(Sort-BoardItem -Items @($dup[2], $dup[1], $dup[0])) | ForEach-Object { $_.Path }
check 'the same fact set sorts identically regardless of the order it arrived in' ($forward -join ',') ($reversed -join ',')

# ---------------------------------------------------------------------------------------
# G18: two repositories that share a directory leaf (no GitHub remote for one or both) must not
# merge into one hottest-item calculation or one display group.
"repository grouping keys on root path, not display name"
$items = @(
    (Row 'dup' -RepoRoot 'C:\repos\one' -Rank 1)
    (Row 'dup' -RepoRoot 'C:\repos\two' -Rank 6)
    (Row 'mid' -RepoRoot 'C:\repos\mid' -Rank 3)
)
$ordered = @(Sort-BoardItem -Items $items)
check 'the genuinely hot repository leads' 'C:\repos\one' $ordered[0].RepoRoot
check 'a merely-warm repository is not overtaken by a same-named repo''s unrelated heat' 'C:\repos\mid' $ordered[1].RepoRoot
check 'the same-named but cooler repository trails on its own merit' 'C:\repos\two' $ordered[2].RepoRoot

$items2 = @(
    (Row 'dup' -RepoRoot 'C:\repos\one' -Rank 1 -Path 'C:\repos\one\a')
    (Row 'dup' -RepoRoot 'C:\repos\two' -Rank 1 -Path 'C:\repos\two\a')
    (Row 'dup' -RepoRoot 'C:\repos\one' -Rank 4 -Path 'C:\repos\one\b')
)
$ordered2 = @(Sort-BoardItem -Items $items2)
check 'two same-named repositories do not interleave their items' 'C:\repos\one' $ordered2[1].RepoRoot

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
