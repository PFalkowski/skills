using Xunit;

namespace WhatsNext.Tests;

public class GitHubIssuesFetchTests
{
    private const string RepoSlug = "owner/repo";

    private const string CannedResponse = """
        {"data":{"repository":{"issues":{"nodes":[
        {"number":10,"title":"Fix the thing","url":"https://github.com/owner/repo/issues/10","state":"OPEN"},
        {"number":11,"title":"Add the other thing","url":"https://github.com/owner/repo/issues/11","state":"OPEN"},
        {"number":12,"title":"Investigate flake","url":"https://github.com/owner/repo/issues/12","state":"OPEN"}
        ]}}}}
        """;

    [Fact]
    public void Fetch_ThreeAssignedOpenIssues_ParsesToExactlyThreeTicketFacts()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        var result = GitHubIssuesFetch.Fetch(cli, "/repo", RepoSlug);

        Assert.NotNull(result);
        Assert.Equal(3, result!.Count);
        Assert.Equal(10, result[0].Number);
        Assert.Equal("Fix the thing", result[0].Title);
        Assert.Equal("https://github.com/owner/repo/issues/10", result[0].Url);
        Assert.Equal("OPEN", result[0].State);
    }

    [Fact]
    public void Fetch_GhFailureExitCode_YieldsNullNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], ["error: not authenticated"]));

        var result = GitHubIssuesFetch.Fetch(cli, "/repo", RepoSlug);

        Assert.Null(result);
    }

    [Fact]
    public void Fetch_UnparseableOutput_YieldsNullNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["not json at all"], []));

        var result = GitHubIssuesFetch.Fetch(cli, "/repo", RepoSlug);

        Assert.Null(result);
    }

    [Fact]
    public void Fetch_NullRepositoryInResponse_YieldsNull()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["""{"data":{"repository":null}}"""], []));

        var result = GitHubIssuesFetch.Fetch(cli, "/repo", RepoSlug);

        Assert.Null(result);
    }

    [Fact]
    public void Fetch_PassesRepoSlugAsSeparateArgumentsNeverInterpolatedIntoTheQuery()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        GitHubIssuesFetch.Fetch(cli, "/repo", RepoSlug);

        var args = cli.LastRun!.Value.Args;
        Assert.Contains("-f", args);
        Assert.Contains("owner=owner", args);
        Assert.Contains("name=repo", args);
        var query = args.Single(arg => arg.StartsWith("query=", StringComparison.Ordinal));
        Assert.DoesNotContain("owner=owner", query);
        Assert.DoesNotContain("name=repo", query);
        Assert.Contains("$owner", query);
        Assert.Contains("$name", query);
        Assert.Contains("assignee", query);
    }
}
