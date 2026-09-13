namespace WhatsNext;

public static class BoardAssembly
{
    public static IReadOnlyList<WorkItem> ForRepository(
        IExternalCli cli,
        string repoName,
        string repoRoot,
        IReadOnlyList<string> worktreePaths,
        IReadOnlyList<PullRequestFact>? openPullRequests,
        IReadOnlyList<LiveSession> liveSessions,
        IReadOnlyList<TranscriptSession> transcriptSessions,
        int staleDays)
    {
        var pullRequestsByHead = IndexByHead(openPullRequests);
        var liveSessionsByPath = IndexByPath(liveSessions);
        var newestTranscriptByPath = IndexNewestByPath(transcriptSessions);
        var items = new List<WorkItem>();
        var claimedPullRequestNumbers = new HashSet<int>();

        foreach (var worktreePath in worktreePaths)
        {
            var fact = WorktreeFactReader.Read(cli, worktreePath);
            if (fact.Missing)
            {
                continue;
            }

            var running = FindByPath(liveSessionsByPath, fact.Path);
            var newestTranscript = FindNewestByPath(newestTranscriptByPath, fact.Path);
            var pullRequest = fact.Branch is not null && pullRequestsByHead.TryGetValue(fact.Branch, out var found) ? found : null;
            var busy = running is not null;
            var sessionId = newestTranscript?.SessionId;

            WorkItem NewItem(int rank, string kind, string label, string? url = null, bool alreadyOpen = false, string? sessionIdOverride = null) =>
                new(repoName, repoRoot, rank, kind, label, fact.Path, fact.Branch, sessionIdOverride ?? sessionId, url, alreadyOpen);

            if (pullRequest is not null)
            {
                claimedPullRequestNumbers.Add(pullRequest.Number);
                var rank = PullRequestRank.Rank(pullRequest);
                if (rank == 1)
                {
                    items.Add(NewItem(1, "pr-ready",
                        $"PR #{pullRequest.Number} green, waiting on you to merge - {pullRequest.Title}", pullRequest.Url, busy));
                    continue;
                }
                if (rank == 2)
                {
                    var why = pullRequest.UnresolvedThreadCount > 0 ? $"{pullRequest.UnresolvedThreadCount} unresolved thread(s)"
                        : pullRequest.Decision == "CHANGES_REQUESTED" ? "changes requested"
                        : pullRequest.Mergeable == "CONFLICTING" ? "merge conflicts"
                        : "checks are failing";
                    items.Add(NewItem(2, "pr-threads", $"PR #{pullRequest.Number} {why} - {pullRequest.Title}", pullRequest.Url, busy));
                    continue;
                }
            }

            if (fact.Branch is not null && fact.Upstream is not null && !fact.UpstreamGone && pullRequest is null && !fact.IsMain)
            {
                var label = openPullRequests is not null
                    ? $"{fact.Branch} is pushed with no pull request"
                    : $"{fact.Branch} is pushed - pull request state unknown";
                items.Add(NewItem(3, "pushed-no-pr", label, alreadyOpen: busy));
                continue;
            }

            if (fact.Branch is not null && fact.Upstream is null && !fact.Dirty && running is null)
            {
                items.Add(NewItem(4, "committed-unpushed", $"{fact.Branch} has commits that were never pushed"));
                continue;
            }

            if (fact.Dirty && running is null)
            {
                items.Add(NewItem(4, "dirty-at-risk", $"{fact.DirtyCount} uncommitted file(s) and nobody sitting in it"));
                continue;
            }

            if (running is { State: "blocked", SessionId: not null })
            {
                items.Add(NewItem(5, "session-question", "a background session is blocked, waiting on you", sessionIdOverride: running.SessionId));
                continue;
            }

            var backlog = BacklogItems.Read(fact.Path);
            if (backlog.Count > 0)
            {
                items.Add(NewItem(6, "backlog", $"{backlog.Count} backlog item(s), next: {backlog[0]}", alreadyOpen: busy));
                continue;
            }

            if (fact.LastCommitAge is { } age && age.TotalDays > staleDays && !fact.IsMain && pullRequest is null)
            {
                items.Add(NewItem(7, "stale", $"no commit in {(int)age.TotalDays} days - cleanup candidate"));
            }
        }

        foreach (var pullRequest in openPullRequests ?? [])
        {
            if (claimedPullRequestNumbers.Contains(pullRequest.Number))
            {
                continue;
            }
            var rank = PullRequestRank.Rank(pullRequest);
            if (rank is null)
            {
                continue;
            }
            var label = rank == 1
                ? $"PR #{pullRequest.Number} green, waiting on you to merge"
                : $"PR #{pullRequest.Number} needs review attention";
            items.Add(new WorkItem(
                repoName, repoRoot, rank.Value, "pr-no-worktree", $"{label} - {pullRequest.Title}",
                repoRoot, Branch: null, SessionId: null, pullRequest.Url, AlreadyOpen: false));
        }

        return items;
    }

    private static Dictionary<string, PullRequestFact> IndexByHead(IReadOnlyList<PullRequestFact>? pullRequests)
    {
        var byHead = new Dictionary<string, PullRequestFact>();
        foreach (var pullRequest in pullRequests ?? [])
        {
            if (pullRequest.Head is not null)
            {
                byHead[pullRequest.Head] = pullRequest;
            }
        }
        return byHead;
    }

    private static Dictionary<string, LiveSession> IndexByPath(IReadOnlyList<LiveSession> liveSessions)
    {
        var byPath = new Dictionary<string, LiveSession>();
        foreach (var session in liveSessions)
        {
            var key = Normalize(session.Cwd);
            if (key is not null)
            {
                byPath[key] = session;
            }
        }
        return byPath;
    }

    private static LiveSession? FindByPath(Dictionary<string, LiveSession> byPath, string path) =>
        Normalize(path) is { } key && byPath.TryGetValue(key, out var session) ? session : null;

    private static Dictionary<string, TranscriptSession> IndexNewestByPath(IReadOnlyList<TranscriptSession> transcriptSessions)
    {
        var byPath = new Dictionary<string, TranscriptSession>();
        foreach (var session in transcriptSessions)
        {
            if (Normalize(session.Cwd) is not { } key)
            {
                continue;
            }
            if (!byPath.TryGetValue(key, out var newest) || session.Written > newest.Written)
            {
                byPath[key] = session;
            }
        }
        return byPath;
    }

    private static TranscriptSession? FindNewestByPath(Dictionary<string, TranscriptSession> byPath, string path) =>
        Normalize(path) is { } key && byPath.TryGetValue(key, out var session) ? session : null;

    private static string? Normalize(string? path) => path?.TrimEnd('/', '\\').ToLowerInvariant();
}
