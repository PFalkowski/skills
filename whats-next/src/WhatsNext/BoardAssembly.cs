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
        int staleDays) =>
        throw new NotImplementedException();
}
