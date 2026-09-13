using Xunit;

namespace WhatsNext.Tests;

public class GitHubPullRequestFetchTests
{
    private const string GitHubRemote = "git@github.com:owner/repo.git";

    private const string CannedResponse = """
        {"data":{"repository":{
        "defaultBranchRef":{"name":"main"},
        "open":{"nodes":[{
        "number":42,"title":"Add feature","isDraft":false,"headRefName":"feature-branch",
        "reviewDecision":null,"mergeable":"MERGEABLE","url":"https://github.com/owner/repo/pull/42",
        "reviewThreads":{"nodes":[{"isResolved":false},{"isResolved":true}]},
        "commits":{"nodes":[{"commit":{"statusCheckRollup":null}}]}}]},
        "merged":{"nodes":[{"headRefName":"old-feature","headRefOid":"abc123"}]}}}}
        """;

    [Fact]
    public void Fetch_GitHubRemote_MakesExactlyOneGraphQlRoundTrip()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Equal(1, cli.RunCallCount);
        Assert.Equal("gh", cli.LastRun!.Value.FileName);
    }

    [Fact]
    public void Fetch_GitHubRemote_PassesOwnerAndNameAsSeparateArgumentsNeverInterpolatedIntoTheQuery()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        var args = cli.LastRun!.Value.Args;
        Assert.Contains("-f", args);
        Assert.Contains("owner=owner", args);
        Assert.Contains("name=repo", args);
        var query = args.Single(arg => arg.StartsWith("query=", StringComparison.Ordinal));
        Assert.DoesNotContain("owner=owner", query);
        Assert.DoesNotContain("name=repo", query);
        Assert.Contains("$owner", query);
        Assert.Contains("$name", query);
    }

    [Fact]
    public void Fetch_CannedResponse_ParsesMergedHeadsFromTheSameCall()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        var head = Assert.Single(result!.MergedHeads);
        Assert.Equal("old-feature", head.Head);
        Assert.Equal("abc123", head.Oid);
    }

    [Fact]
    public void Fetch_CannedResponse_ParsesOpenPullRequestFacts()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Equal("main", result!.DefaultBranch);
        var pr = Assert.Single(result.PullRequests);
        Assert.Equal(42, pr.Number);
        Assert.Equal("feature-branch", pr.Head);
        Assert.False(pr.IsDraft);
        Assert.Equal(1, pr.UnresolvedThreadCount);
    }

    [Fact]
    public void Fetch_NullStatusRollup_IsNotTreatedAsAFailure()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Null(result!.PullRequests[0].Rollup);
    }

    [Theory]
    [InlineData("https://gitlab.com/owner/repo.git")]
    [InlineData(null)]
    public void Fetch_NonGitHubRemote_GetsNoSlugAndMakesNoCall(string? remoteUrl)
    {
        var cli = new FakeExternalCli();

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", remoteUrl);

        Assert.Null(result);
        Assert.Equal(0, cli.RunCallCount);
    }

    [Fact]
    public void Fetch_GhFailureExitCode_YieldsRemoteUnknownNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], ["error: not authenticated"]));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Null(result);
    }

    [Fact]
    public void Fetch_UnparseableOutput_YieldsRemoteUnknownNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["not json at all"], []));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Null(result);
    }

    [Fact]
    public void Fetch_NullRepositoryInResponse_YieldsRemoteUnknown()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["""{"data":{"repository":null}}"""], []));

        var result = GitHubPullRequestFetch.Fetch(cli, "/repo", GitHubRemote);

        Assert.Null(result);
    }
}
