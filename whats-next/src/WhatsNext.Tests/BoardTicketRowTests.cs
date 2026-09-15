using Xunit;

namespace WhatsNext.Tests;

// Proves AC2 ("exactly three ticket rows for a fixture account with three assigned, open
// issues") and AC3's positive case ("a matched key links the ticket row's Branch/SessionId")
// end to end through Board.Build, wiring GitHubIssuesFetch + TicketMatching in per S1g.
public class BoardTicketRowTests
{
    private const string RepoSlug = "owner/repo";

    private const string ThreeIssuesResponse = """
        {"data":{"repository":{"issues":{"nodes":[
        {"number":10,"title":"Fix the thing","url":"https://github.com/owner/repo/issues/10","state":"OPEN"},
        {"number":11,"title":"Add the other thing","url":"https://github.com/owner/repo/issues/11","state":"OPEN"},
        {"number":12,"title":"Investigate flake","url":"https://github.com/owner/repo/issues/12","state":"OPEN"}
        ]}}}}
        """;

    [Fact]
    public void AFixtureAccountWithThreeAssignedOpenIssuesProducesExactlyThreeTicketRows()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [ThreeIssuesResponse], []));
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "r", RepoSlug, "https://github.com/owner/repo.git", Worktrees: []),
        };
        var sources = new[] { new Source("s1", SourceKind.GitHubIssues, SourceOrigin.Confirmed, RepoSlug, ProjectKey: null) };

        var items = Board.Build(cli, new SystemClock(), repos, sources, [], transcriptSessions: [], staleDays: 7);

        Assert.Equal(3, items.Count(item => item.Kind == "ticket-todo"));
    }

    [Fact]
    public void AMatchedBranchLinksTheTicketRowsBranchAndSessionId()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("issue-10");

        var cli = new FixtureBackedExternalCli(ThreeIssuesResponse, claudeAgentsJson: "[]");
        var repos = new[]
        {
            new RepositoryGroup(fx.Repo, "r", RepoSlug, "https://github.com/owner/repo.git", Worktrees: [worktree]),
        };
        var sources = new[] { new Source("s1", SourceKind.GitHubIssues, SourceOrigin.Confirmed, RepoSlug, ProjectKey: null) };
        var transcriptSessions = new[] { new TranscriptSession(worktree, "sess-1", DateTimeOffset.UtcNow) };

        var items = Board.Build(cli, new SystemClock(), repos, sources, [], transcriptSessions, staleDays: 7);

        var ticketRow = Assert.Single(items, item => item.Kind == "ticket-todo" && item.Url == "https://github.com/owner/repo/issues/10");
        Assert.Equal("issue-10", ticketRow.Branch);
        Assert.Equal("sess-1", ticketRow.SessionId);
    }

    [Fact]
    public void NoConfiguredGitHubIssuesSourceProducesNoTicketRows()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [ThreeIssuesResponse], []));
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "r", RepoSlug, "https://github.com/owner/repo.git", Worktrees: []),
        };

        var items = Board.Build(cli, new SystemClock(), repos, sources: [], liveSessions: [], transcriptSessions: [], staleDays: 7);

        Assert.DoesNotContain(items, item => item.Kind == "ticket-todo");
    }
}
