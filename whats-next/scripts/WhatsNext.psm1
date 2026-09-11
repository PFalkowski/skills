#requires -Version 7
Set-StrictMode -Version Latest

function Invoke-Git {
    param([string]$Dir, [string[]]$GitArgs)
    $out = & git -C $Dir @GitArgs 2>$null
    [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Lines = @($out) }
}

function Get-WorktreeAdminDir {
    param([string]$Path)
    $dotGit = Join-Path $Path '.git'
    if (Test-Path -LiteralPath $dotGit -PathType Container) { return $dotGit }
    if (-not (Test-Path -LiteralPath $dotGit -PathType Leaf)) { return $null }
    $line = Get-Content -LiteralPath $dotGit -TotalCount 1 -ErrorAction SilentlyContinue
    if ($line -match '^gitdir:\s*(.+)$') { return $Matches[1].Trim() }
    return $null
}

function ConvertTo-WorktreeFact {
    param([string]$Path, [bool]$StatusOk, [string[]]$StatusLines, [string]$AgeSeconds)

    $fact = [pscustomobject]@{
        Path = $Path; Missing = $false; IsMain = $false; Locked = $false
        Branch = $null; Detached = $false; Upstream = $null; UpstreamGone = $false
        Ahead = 0; Behind = 0; Dirty = $false; DirtyCount = 0; IgnoredCount = 0
        HeadOid = $null; LastCommitAge = $null
    }

    # git prints nothing and exits non-zero when the directory or its .git pointer is broken.
    # Reading only "was the output empty" would call that clean.
    if (-not (Test-Path -LiteralPath $Path -PathType Container) -or -not $StatusOk) {
        $fact.Missing = $true
        return $fact
    }

    $admin = Get-WorktreeAdminDir -Path $Path
    if (-not $admin) {
        $fact.Missing = $true
        return $fact
    }
    $fact.IsMain = (Test-Path -LiteralPath $admin -PathType Container) -and (Split-Path $admin -Leaf) -eq '.git'
    $fact.Locked = Test-Path -LiteralPath (Join-Path $admin 'locked')

    $sawAheadBehind = $false
    foreach ($line in $StatusLines) {
        if (-not $line) { continue }
        if ($line.StartsWith('!')) { $fact.IgnoredCount++; continue }
        if (-not $line.StartsWith('#')) { $fact.DirtyCount++; continue }
        $parts = $line -split '\s+', 3
        if ($parts.Count -lt 3) { continue }
        switch ($parts[1]) {
            'branch.oid' { $fact.HeadOid = $parts[2] }
            'branch.head' { if ($parts[2] -eq '(detached)') { $fact.Detached = $true } else { $fact.Branch = $parts[2] } }
            'branch.upstream' { $fact.Upstream = $parts[2] }
            'branch.ab' {
                $sawAheadBehind = $true
                if ($parts[2] -match '^\+(\d+)\s+-(\d+)$') { $fact.Ahead = [int]$Matches[1]; $fact.Behind = [int]$Matches[2] }
            }
        }
    }
    $fact.Dirty = $fact.DirtyCount -gt 0
    # git omits branch.ab when the upstream it still has configured no longer exists on the remote.
    $fact.UpstreamGone = ($null -ne $fact.Upstream) -and (-not $sawAheadBehind)

    if ($AgeSeconds -match '^\d+$') {
        $fact.LastCommitAge = (Get-Date) - [DateTimeOffset]::FromUnixTimeSeconds([long]$AgeSeconds).LocalDateTime
    }
    return $fact
}

$script:StatusArgs = @('status', '--porcelain=v2', '--branch', '--ignored=matching')
$script:AgeArgs = @('log', '-1', '--format=%ct')

function Get-WorktreeFact {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return ConvertTo-WorktreeFact -Path $Path -StatusOk $false -StatusLines @() -AgeSeconds ''
    }
    $status = Invoke-Git -Dir $Path -GitArgs $script:StatusArgs
    $age = Invoke-Git -Dir $Path -GitArgs $script:AgeArgs
    ConvertTo-WorktreeFact -Path $Path -StatusOk $status.Ok -StatusLines $status.Lines `
        -AgeSeconds $(if ($age.Ok -and $age.Lines.Count) { $age.Lines[0] } else { '' })
}

function Get-WorktreeFactSet {
    param([string[]]$Paths)
    if (-not $Paths -or $Paths.Count -eq 0) { return @() }
    $statusArgs = $script:StatusArgs
    $ageArgs = $script:AgeArgs
    $raw = @($Paths | ForEach-Object -ThrottleLimit 12 -Parallel {
        $path = $_
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            [pscustomobject]@{ Path = $path; Ok = $false; Lines = @(); Age = '' }
            return
        }
        $lines = @(& git -C $path @using:statusArgs 2>$null)
        $ok = ($LASTEXITCODE -eq 0)
        $age = @(& git -C $path @using:ageArgs 2>$null)
        [pscustomobject]@{ Path = $path; Ok = $ok; Lines = $lines; Age = $(if ($age.Count) { $age[0] } else { '' }) }
    })
    return @($raw | ForEach-Object {
        ConvertTo-WorktreeFact -Path $_.Path -StatusOk $_.Ok -StatusLines $_.Lines -AgeSeconds $_.Age
    })
}

function Test-WorktreeRemovable {
    param(
        [Parameter(Mandatory)]$Fact,
        [string]$DefaultRef,
        [string[]]$MergedHeads = @(),
        [switch]$AllowIgnored
    )

    $no = { param($why) [pscustomobject]@{ Removable = $false; Reason = $why } }
    $yes = { param($why) [pscustomobject]@{ Removable = $true; Reason = $why } }

    if ($Fact.Missing) { return & $no 'directory missing' }
    if ($Fact.IsMain) { return & $no 'main worktree' }
    if ($Fact.Locked) { return & $no 'locked' }
    if ($Fact.Dirty) { return & $no 'uncommitted changes' }

    $here = (Get-Location).Path
    $target = (Resolve-Path -LiteralPath $Fact.Path -ErrorAction SilentlyContinue)?.Path
    if ($target -and ($here -eq $target -or $here.StartsWith($target + [IO.Path]::DirectorySeparatorChar))) {
        return & $no 'current worktree'
    }

    # `git worktree remove` refuses on tracked and untracked files but deletes ignored ones
    # without a word, and ignored is where local configuration and skill state live.
    if ($Fact.IgnoredCount -gt 0 -and -not $AllowIgnored) { return & $no 'ignored files present' }

    if (-not $DefaultRef) { return & $no 'no default branch' }
    if (-not (Invoke-Git -Dir $Fact.Path -GitArgs @('rev-parse', '--verify', '--quiet', $DefaultRef)).Ok) {
        return & $no 'no default branch'
    }

    if ((Invoke-Git -Dir $Fact.Path -GitArgs @('merge-base', '--is-ancestor', 'HEAD', $DefaultRef)).Ok) {
        return & $yes 'merged'
    }

    # A squash merge rewrites the branch into one new commit, so its own commits are never
    # ancestors of the default branch and the ancestor test above is false for every squash-merged
    # branch that ever landed. The forge saying the pull request merged is the only proof left.
    # A deleted upstream is NOT accepted on its own: a branch can outlive its remote while still
    # holding commits that exist nowhere else.
    if ($Fact.Branch -and $MergedHeads -contains $Fact.Branch) { return & $yes 'merged pull request' }

    return & $no 'unmerged commits'
}

function Get-DefaultRef {
    param([Parameter(Mandatory)][string]$RepoRoot, [string]$BranchName)

    $candidates = @()
    if ($BranchName) { $candidates += "origin/$BranchName" }
    $symbolic = Invoke-Git -Dir $RepoRoot -GitArgs @('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD')
    if ($symbolic.Ok -and $symbolic.Lines.Count) { $candidates += $symbolic.Lines[0] }
    $candidates += 'origin/main', 'origin/master'

    foreach ($ref in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        if ((Invoke-Git -Dir $RepoRoot -GitArgs @('rev-parse', '--verify', '--quiet', $ref)).Ok) { return $ref }
    }
    return $null
}

function Read-TranscriptHint {
    param([string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line)) { return $null }
    try { $entry = $Line | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
    if ($entry -isnot [pscustomobject]) { return $null }
    $cwd = $entry.PSObject.Properties['cwd']?.Value
    if (-not $cwd) { return $null }
    [pscustomobject]@{
        Cwd = $cwd
        SessionId = $entry.PSObject.Properties['sessionId']?.Value
        Branch = $entry.PSObject.Properties['gitBranch']?.Value
    }
}

function Get-TranscriptSession {
    param([int]$SinceDays = 14, [string]$ProjectsRoot = (Join-Path $HOME '.claude/projects'))
    if (-not (Test-Path -LiteralPath $ProjectsRoot)) { return @() }

    $cutoff = (Get-Date).AddDays(-$SinceDays)
    $files = @(Get-ChildItem -Path (Join-Path $ProjectsRoot '*/*.jsonl') -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $cutoff })
    if ($files.Count -eq 0) { return @() }

    # The encoded directory name cannot be decoded back to a path, so the working directory has to
    # come from inside the file. That format is internal to Claude Code and documented as changing
    # between releases, so a file that no longer parses costs the board a row, never the run.
    $raw = @($files | ForEach-Object -ThrottleLimit 12 -Parallel {
        foreach ($line in (Get-Content -LiteralPath $_.FullName -TotalCount 20 -ErrorAction SilentlyContinue)) {
            if (-not $line -or $line[0] -ne '{') { continue }
            try { $entry = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }
            $cwd = $entry.PSObject.Properties['cwd']?.Value
            if ($cwd) {
                [pscustomobject]@{ Cwd = $cwd; SessionId = $_.BaseName; Written = $_.LastWriteTime }
                break
            }
        }
    })
    return @($raw)
}

function Get-CandidateDirectory {
    param($TranscriptSessions, $LiveSessions)
    $temp = [IO.Path]::GetTempPath().TrimEnd('/', '\')
    $dirs = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in @($LiveSessions) + @($TranscriptSessions)) {
        $cwd = $entry.Cwd
        # Probe and fixture repositories under the temp directory are not work.
        if (-not $cwd -or $cwd.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (Test-Path -LiteralPath $cwd -PathType Container) { [void]$dirs.Add($cwd) }
    }
    return @($dirs)
}

function Get-LiveSession {
    $raw = & claude agents --json 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return @() }
    try { $entries = $raw | Out-String | ConvertFrom-Json } catch { return @() }
    return @($entries | ForEach-Object {
        [pscustomobject]@{
            SessionId = $_.PSObject.Properties['sessionId']?.Value
            Cwd = $_.PSObject.Properties['cwd']?.Value
            Kind = $_.PSObject.Properties['kind']?.Value
            Name = $_.PSObject.Properties['name']?.Value
            State = $_.PSObject.Properties['state']?.Value
            Status = $_.PSObject.Properties['status']?.Value
        }
    })
}

function Get-RepositoryGroup {
    param([string[]]$Directories)
    if (-not $Directories -or $Directories.Count -eq 0) { return @() }

    $probed = @($Directories | ForEach-Object -ThrottleLimit 12 -Parallel {
        $common = & git -C $_ rev-parse --path-format=absolute --git-common-dir 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $common) { return }
        $origin = & git -C $_ remote get-url origin 2>$null
        [pscustomobject]@{ Dir = $_; Common = @($common)[0].TrimEnd('/', '\'); Origin = $(if ($LASTEXITCODE -eq 0) { @($origin)[0] } else { $null }) }
    })

    $seen = @{}
    $groups = foreach ($entry in $probed) {
        if ($seen.ContainsKey($entry.Common)) { continue }
        $seen[$entry.Common] = $true
        $root = Split-Path $entry.Common -Parent
        # Only github.com remotes can be asked about pull requests, so only they get a slug; every
        # other repository still contributes its worktrees, sessions and backlog to the board.
        $slug = $null
        if ($entry.Origin -and $entry.Origin -match '(?i)github\.com[:/]([^/:]+)/([^/]+?)(\.git)?/?$') {
            $slug = "$($Matches[1])/$($Matches[2])"
        }
        [pscustomobject]@{
            Root = $root
            Name = if ($slug) { $slug } else { Split-Path $root -Leaf }
            Slug = $slug
            Worktrees = @(Get-WorktreePath -RepoRoot $entry.Dir)
        }
    }
    return @($groups)
}

function Get-WorktreePath {
    param([Parameter(Mandatory)][string]$RepoRoot)
    $listing = Invoke-Git -Dir $RepoRoot -GitArgs @('worktree', 'list', '--porcelain')
    if (-not $listing.Ok) { return @() }
    return @($listing.Lines | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring(9).Trim() })
}

function Get-RepositoryPullRequest {
    param([string]$Slug)
    if (-not $Slug) { return $null }
    $owner, $name = $Slug -split '/', 2

    # One round trip per repository. gh pr list cannot report unresolved review threads at all, and
    # a per-pull-request follow-up would multiply the only network cost this board has. The merged
    # heads come back in the same call because prune cannot recognise a squash merge without them.
    $query = @'
query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
defaultBranchRef{name}
open:pullRequests(states:OPEN,first:100){nodes{
number title isDraft headRefName reviewDecision mergeable url
reviewThreads(first:100){nodes{isResolved}}
commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}
merged:pullRequests(states:MERGED,first:100,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{headRefName}}}}
'@
    $raw = & gh api graphql -f owner=$owner -f name=$name -f query=$query 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
    try { $parsed = $raw | Out-String | ConvertFrom-Json } catch { return $null }
    $repo = $parsed.data.repository
    if (-not $repo) { return $null }

    [pscustomobject]@{
        DefaultBranch = $repo.defaultBranchRef.name
        MergedHeads = @($repo.merged.nodes.headRefName)
        PullRequests = @($repo.open.nodes | ForEach-Object {
            [pscustomobject]@{
                Number = $_.number; Title = $_.title; Head = $_.headRefName; Url = $_.url
                IsDraft = $_.isDraft; Decision = $_.reviewDecision; Mergeable = $_.mergeable
                Rollup = $_.commits.nodes[0].commit.statusCheckRollup?.state
                Unresolved = @($_.reviewThreads.nodes | Where-Object { -not $_.isResolved }).Count
            }
        })
    }
}

function Get-PullRequestRank {
    param([Parameter(Mandatory)]$PullRequest)
    if ($PullRequest.IsDraft) { return $null }
    if ($PullRequest.Unresolved -gt 0 -or $PullRequest.Decision -eq 'CHANGES_REQUESTED') { return 2 }
    if ($PullRequest.Decision -eq 'REVIEW_REQUIRED') { return $null }
    # A null rollup means the repository configures no checks at all, which is not a failure.
    if ($PullRequest.Rollup -notin @('SUCCESS', $null)) { return $null }
    if ($PullRequest.Mergeable -ne 'MERGEABLE') { return $null }
    return 1
}

function Get-BacklogItem {
    param([Parameter(Mandatory)][string]$WorktreePath)
    $file = Join-Path $WorktreePath 'prompts/backlog.md'
    if (-not (Test-Path -LiteralPath $file)) { return @() }
    return @(Get-Content -LiteralPath $file -ErrorAction SilentlyContinue |
        Where-Object { $_ -match '^\s*[-*]\s*\[\s\]\s*(.+)$' } |
        ForEach-Object { $Matches[1].Trim() })
}

function Sort-BoardItem {
    param([Parameter(Mandatory)]$Items)
    $hottest = @{}
    foreach ($item in $Items) {
        if (-not $hottest.ContainsKey($item.Repo) -or $item.Rank -lt $hottest[$item.Repo]) {
            $hottest[$item.Repo] = $item.Rank
        }
    }
    return @($Items | Sort-Object @{ Expression = { $hottest[$_.Repo] } }, @{ Expression = { $_.Repo } }, @{ Expression = { $_.Rank } })
}

function New-BoardItem {
    param($Repo, [int]$Rank, [string]$Kind, [string]$Label, $Fact, [string]$Path, [string]$SessionId, [string]$Url, [switch]$Open)
    [pscustomobject]@{
        Repo = $Repo.Name; RepoRoot = $Repo.Root; Rank = $Rank; Kind = $Kind; Label = $Label
        Path = if ($Path) { $Path } else { $Fact.Path }
        Branch = if ($Fact) { $Fact.Branch } else { $null }
        SessionId = $SessionId; Url = $Url; AlreadyOpen = [bool]$Open
    }
}

function Get-RepositoryBoardItem {
    param($Repo, $Remote, $NewestSession, $LiveHere, [int]$StaleDays)

    $openPrs = @(if ($Remote) { $Remote.PullRequests })
    $byHead = @{}
    foreach ($pr in $openPrs) { $byHead[$pr.Head] = $pr }
    $normalise = { param($p) if ($p) { $p.TrimEnd('/', '\').ToLowerInvariant() } }
    $claimed = @{}

    foreach ($fact in (Get-WorktreeFactSet -Paths $Repo.Worktrees)) {
        if ($fact.Missing) { continue }
        $key = & $normalise $fact.Path
        $session = if ($key -and $NewestSession.ContainsKey($key)) { $NewestSession[$key] } else { $null }
        $running = if ($key -and $LiveHere.ContainsKey($key)) { $LiveHere[$key] } else { $null }
        $pr = if ($fact.Branch -and $byHead.ContainsKey($fact.Branch)) { $byHead[$fact.Branch] } else { $null }
        $sessionId = if ($session) { $session.SessionId } else { $null }
        $busy = [bool]$running

        if ($pr) {
            $claimed[$pr.Number] = $true
            switch (Get-PullRequestRank -PullRequest $pr) {
                1 { New-BoardItem $Repo 1 'pr-ready' "PR #$($pr.Number) green, waiting on you to merge - $($pr.Title)" $fact -SessionId $sessionId -Url $pr.Url -Open:$busy; continue }
                2 {
                    $why = if ($pr.Unresolved -gt 0) { "$($pr.Unresolved) unresolved thread(s)" } else { 'changes requested' }
                    New-BoardItem $Repo 2 'pr-threads' "PR #$($pr.Number) $why - $($pr.Title)" $fact -SessionId $sessionId -Url $pr.Url -Open:$busy
                    continue
                }
            }
        }
        if ($fact.Branch -and $fact.Upstream -and -not $fact.UpstreamGone -and -not $pr) {
            New-BoardItem $Repo 3 'pushed-no-pr' "$($fact.Branch) is pushed with no pull request" $fact -SessionId $sessionId -Open:$busy
            continue
        }
        if ($fact.Dirty -and -not $running) {
            New-BoardItem $Repo 4 'dirty-at-risk' "$($fact.DirtyCount) uncommitted file(s) and nobody sitting in it" $fact -SessionId $sessionId
            continue
        }
        if ($running -and $running.State -eq 'blocked' -and $running.SessionId) {
            New-BoardItem $Repo 5 'session-question' 'a background session is blocked, waiting on you' $fact -SessionId $running.SessionId
            continue
        }
        $backlog = @(Get-BacklogItem -WorktreePath $fact.Path)
        if ($backlog.Count -gt 0) {
            New-BoardItem $Repo 6 'backlog' "$($backlog.Count) backlog item(s), next: $($backlog[0])" $fact -SessionId $sessionId -Open:$busy
            continue
        }
        if ($fact.LastCommitAge -and $fact.LastCommitAge.TotalDays -gt $StaleDays -and -not $fact.IsMain) {
            New-BoardItem $Repo 7 'stale' "no commit in $([int]$fact.LastCommitAge.TotalDays) days - cleanup candidate" $fact -SessionId $sessionId
        }
    }

    # A pull request whose branch is checked out nowhere still needs somewhere to land.
    foreach ($pr in $openPrs) {
        if ($claimed.ContainsKey($pr.Number)) { continue }
        $rank = Get-PullRequestRank -PullRequest $pr
        if (-not $rank) { continue }
        $label = if ($rank -eq 1) { "PR #$($pr.Number) green, waiting on you to merge" } else { "PR #$($pr.Number) needs review attention" }
        New-BoardItem $Repo $rank 'pr-no-worktree' "$label - $($pr.Title)" $null -Path $Repo.Root -Url $pr.Url
    }
}

function Get-Board {
    param([int]$SinceDays = 14, [int]$StaleDays = 7)

    $live = @(Get-LiveSession)
    $transcripts = @(Get-TranscriptSession -SinceDays $SinceDays)
    $repos = @(Get-RepositoryGroup -Directories (Get-CandidateDirectory -TranscriptSessions $transcripts -LiveSessions $live))

    $normalise = { param($p) if ($p) { $p.TrimEnd('/', '\').ToLowerInvariant() } }
    $newestSession = @{}
    foreach ($entry in $transcripts) {
        $key = & $normalise $entry.Cwd
        if (-not $key) { continue }
        if (-not $newestSession.ContainsKey($key) -or $entry.Written -gt $newestSession[$key].Written) {
            $newestSession[$key] = $entry
        }
    }
    $liveHere = @{}
    foreach ($entry in $live) {
        $key = & $normalise $entry.Cwd
        if ($key) { $liveHere[$key] = $entry }
    }

    $slugs = @($repos | Where-Object { $_.Slug } | ForEach-Object { $_.Slug })
    $remotes = @{}
    if ($slugs.Count) {
        $self = $PSCommandPath
        foreach ($result in @($slugs | ForEach-Object -ThrottleLimit 6 -Parallel {
            Import-Module $using:self -DisableNameChecking
            [pscustomobject]@{ Slug = $_; Data = (Get-RepositoryPullRequest -Slug $_) }
        })) { $remotes[$result.Slug] = $result.Data }
    }

    $items = foreach ($repo in $repos) {
        $remote = if ($repo.Slug -and $remotes.ContainsKey($repo.Slug)) { $remotes[$repo.Slug] } else { $null }
        Get-RepositoryBoardItem -Repo $repo -Remote $remote -NewestSession $newestSession -LiveHere $liveHere -StaleDays $StaleDays
    }
    return Sort-BoardItem -Items @($items)
}

function Get-PruneCandidate {
    param($Repo, $Remote, [switch]$AllowIgnored)
    $defaultRef = Get-DefaultRef -RepoRoot $Repo.Root -BranchName $(if ($Remote) { $Remote.DefaultBranch } else { $null })
    $mergedHeads = @(if ($Remote) { $Remote.MergedHeads })
    foreach ($path in $Repo.Worktrees) {
        $verdict = Test-WorktreeRemovable -Fact (Get-WorktreeFact -Path $path) -DefaultRef $defaultRef `
            -MergedHeads $mergedHeads -AllowIgnored:$AllowIgnored
        [pscustomobject]@{
            Repo = $Repo.Name; Root = $Repo.Root; Path = $path
            Removable = $verdict.Removable; Reason = $verdict.Reason
        }
    }
}

Export-ModuleMember -Function Invoke-Git, ConvertTo-WorktreeFact, Get-WorktreeFact, Get-WorktreeFactSet,
    Test-WorktreeRemovable, Get-DefaultRef, Read-TranscriptHint, Get-TranscriptSession,
    Get-CandidateDirectory, Get-LiveSession, Get-RepositoryGroup, Get-WorktreePath,
    Get-RepositoryPullRequest, Get-PullRequestRank, Get-BacklogItem, Sort-BoardItem,
    Get-RepositoryBoardItem, Get-Board, Get-PruneCandidate
