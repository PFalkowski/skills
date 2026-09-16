namespace WhatsNext;

// Ports Get-Board (wip.ps1 at 5fe502c): fetch each repository's open pull requests, assemble its
// ranked items (BoardAssembly), then sort the combined list (BoardSorting).
public static class Board
{
    public static IReadOnlyList<WorkItem> Build(
        IExternalCli cli,
        IClock clock,
        IReadOnlyList<RepositoryGroup> repos,
        IReadOnlyList<Source> sources,
        IReadOnlyList<LiveSession> liveSessions,
        IReadOnlyList<TranscriptSession> transcriptSessions,
        int staleDays)
    {
        var items = new List<WorkItem>();
        foreach (var repo in repos)
        {
            var remote = repo.Slug is not null ? GitHubPullRequestFetch.Fetch(cli, repo.Root, repo.OriginUrl) : null;
            var ticketSource = repo.Slug is not null
                ? sources.FirstOrDefault(source => source.Kind == SourceKind.GitHubIssues && source.RepoSlug == repo.Slug)
                : null;
            var tickets = ticketSource is not null ? GitHubIssuesFetch.Fetch(cli, repo.Root, ticketSource.RepoSlug) : null;
            items.AddRange(BoardAssembly.ForRepository(
                cli, clock, repo.Name, repo.Root, repo.Worktrees, remote?.PullRequests, tickets, liveSessions, transcriptSessions, staleDays));
        }

        return BoardSorting.Sort(items);
    }
}
