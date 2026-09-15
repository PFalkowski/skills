using Xunit;

namespace WhatsNext.Tests;

// S1h: the composition SourceWiring.EnsureSources feeds into Board.Build, exercised the same way
// Program.cs's RunBoard calls both — proves AC1, AC2, and AC5 end to end through the real
// call path, not just at S1b/S1c/S1d/S1f/S1g's unit level.
public class SourceWiringTests
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
    public void EnsureSources_RepositoryWithGitHubRemoteAndNoExistingConfig_WritesADiscoveredSourceToConfigJson()
    {
        var stateRoot = Directory.CreateTempSubdirectory("wn-sourcewiring-").FullName;
        var cli = new FixtureBackedExternalCli(ThreeIssuesResponse, claudeAgentsJson: "[]");
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "repo", RepoSlug, "https://github.com/owner/repo.git", Worktrees: []),
        };

        var sources = SourceWiring.EnsureSources(cli, stateRoot, repos);

        var source = Assert.Single(sources);
        Assert.Equal(SourceKind.GitHubIssues, source.Kind);
        Assert.Equal(SourceOrigin.Discovered, source.Origin);
        Assert.Equal(RepoSlug, source.RepoSlug);

        var configPath = Path.Combine(stateRoot, "config.json");
        Assert.True(File.Exists(configPath));
        var written = ConfigFile.Read(configPath);
        Assert.Equal(sources, written.Sources);
    }

    [Fact]
    public void EnsureSourcesThenBoardBuild_FixtureAccountWithThreeAssignedOpenIssuesProducesExactlyThreeTicketRows()
    {
        var stateRoot = Directory.CreateTempSubdirectory("wn-sourcewiring-").FullName;
        var cli = new FixtureBackedExternalCli(ThreeIssuesResponse, claudeAgentsJson: "[]");
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "repo", RepoSlug, "https://github.com/owner/repo.git", Worktrees: []),
        };

        var sources = SourceWiring.EnsureSources(cli, stateRoot, repos);
        var items = Board.Build(cli, new SystemClock(), repos, sources, liveSessions: [], transcriptSessions: [], staleDays: 7);

        Assert.Equal(3, items.Count(item => item.Kind == "ticket-todo"));
    }

    [Fact]
    public void EnsureSources_SecondRunWithNothingChanged_MakesNoExternalCliCallsForDiscovery()
    {
        var stateRoot = Directory.CreateTempSubdirectory("wn-sourcewiring-").FullName;
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "repo", RepoSlug, "https://github.com/owner/repo.git", Worktrees: []),
        };
        SourceWiring.EnsureSources(new FixtureBackedExternalCli(ThreeIssuesResponse, claudeAgentsJson: "[]"), stateRoot, repos);

        var secondRunCli = new FakeExternalCli();
        var sources = SourceWiring.EnsureSources(secondRunCli, stateRoot, repos);

        Assert.Single(sources);
        Assert.Equal(0, secondRunCli.RunCallCount);
    }

    [Fact]
    public void EnsureSources_RepositoryWithNoGitHubSlug_IsSkippedAndConfigJsonIsNeverWritten()
    {
        var stateRoot = Directory.CreateTempSubdirectory("wn-sourcewiring-").FullName;
        var repos = new[]
        {
            new RepositoryGroup(@"C:\repo", "repo", Slug: null, OriginUrl: null, Worktrees: []),
        };

        var sources = SourceWiring.EnsureSources(new FakeExternalCli(), stateRoot, repos);

        Assert.Empty(sources);
        Assert.False(File.Exists(Path.Combine(stateRoot, "config.json")));
    }
}
