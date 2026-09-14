using Xunit;

namespace WhatsNext.Tests;

public class TicketMatchingTests
{
    [Fact]
    public void AConfiguredPrefixKeyMatches() =>
        Assert.Equal(["PROJ-123"], TicketMatching.FindProjectKeys("fixed in PROJ-123 today", Prefixes("PROJ")));

    [Fact]
    public void TheSamePrefixShapeIsIgnoredWhenNotConfigured() =>
        Assert.Empty(TicketMatching.FindProjectKeys("fixed in PROJ-123 today", Prefixes("OTHER")));

    [Fact]
    public void AProjectKeyShapedTokenWithAnUnconfiguredPrefixNeverMatches() =>
        Assert.Empty(TicketMatching.FindProjectKeys("touches PROJECT-123 only", Prefixes("PROJ")));

    [Fact]
    public void ACommitHashNeverMatchesTheKeyPattern() =>
        Assert.Empty(TicketMatching.FindProjectKeys("commit a1b2c3d fixed it", Prefixes("PROJ", "A1B2C3D")));

    [Theory]
    [InlineData("built against UTF-8 text")]
    [InlineData("hashed with SHA-256")]
    [InlineData("dated ISO-8601")]
    [InlineData("patched CVE-2024-1234")]
    [InlineData("served over HTTP-2")]
    [InlineData("per ADR-0001")]
    public void ANonTicketTokenNeverMatchesWithoutItsPrefixConfigured(string text) =>
        Assert.Empty(TicketMatching.FindProjectKeys(text, Prefixes("PROJ")));

    [Fact]
    public void MultipleConfiguredPrefixesAllMatch() =>
        Assert.Equal(["PROJ-1", "OTHER-2"], TicketMatching.FindProjectKeys("PROJ-1 and OTHER-2", Prefixes("PROJ", "OTHER")));

    [Fact]
    public void AHashNumberReferencesAnIssue() =>
        Assert.Equal([42], TicketMatching.FindGitHubIssueNumbers("see #42 for context"));

    [Fact]
    public void AnIssueUrlReferencesAnIssue() =>
        Assert.Equal([17], TicketMatching.FindGitHubIssueNumbers("https://github.com/acme/repo/issues/17"));

    [Fact]
    public void APullRequestUrlReferencesAnIssue() =>
        Assert.Equal([9], TicketMatching.FindGitHubIssueNumbers("https://github.com/acme/repo/pull/9"));

    [Theory]
    [InlineData("fixes #5")]
    [InlineData("Closes #5")]
    [InlineData("this resolves #5")]
    public void AClosingKeywordReferencesAnIssue(string text) =>
        Assert.Equal([5], TicketMatching.FindGitHubIssueNumbers(text));

    [Fact]
    public void SeveralIssueReferencesAreAllFound() =>
        Assert.Equal([5, 6], TicketMatching.FindGitHubIssueNumbers("closes #5 and resolves #6"));

    [Fact]
    public void PlainTextWithNoReferenceFindsNoIssues() =>
        Assert.Empty(TicketMatching.FindGitHubIssueNumbers("nothing to see here"));

    [Fact]
    public void AnIssueBranchTokenIsFound() =>
        Assert.Equal(123, TicketMatching.FindGitHubIssueNumberInBranch("issue-123"));

    [Fact]
    public void AGhBranchTokenIsFound() =>
        Assert.Equal(77, TicketMatching.FindGitHubIssueNumberInBranch("gh-77"));

    [Fact]
    public void AnIssueTokenInsideALongerBranchNameIsFound() =>
        Assert.Equal(123, TicketMatching.FindGitHubIssueNumberInBranch("feature/issue-123-fix-thing"));

    [Fact]
    public void ABranchWithNoIssueTokenFindsNothing() =>
        Assert.Null(TicketMatching.FindGitHubIssueNumberInBranch("feature/redesign-header"));

    [Fact]
    public void AProjectKeyShapedBranchIsNotAGitHubIssueBranchToken() =>
        Assert.Null(TicketMatching.FindGitHubIssueNumberInBranch("PROJ-123-fix"));

    [Fact]
    public void TwoSignalsSharingAReferenceCollapseIntoOneGroup()
    {
        var groups = TicketMatching.Group(
        [
            new MatchSignal("branch:issue-42", ["GH:42"]),
            new MatchSignal("commit:abc123", ["GH:42"]),
        ]);

        var group = Assert.Single(groups);
        Assert.Equal(["branch:issue-42", "commit:abc123"], group.SignalIds.OrderBy(x => x));
        Assert.Equal(["GH:42"], group.References);
    }

    [Fact]
    public void SignalsWithNoSharedReferenceStayInSeparateGroups()
    {
        var groups = TicketMatching.Group(
        [
            new MatchSignal("branch:issue-1", ["GH:1"]),
            new MatchSignal("branch:issue-2", ["GH:2"]),
        ]);

        Assert.Equal(2, groups.Count);
    }

    [Fact]
    public void AGroupSpanningTwoLinkedKeysCarriesBothKeys()
    {
        var groups = TicketMatching.Group(
        [
            new MatchSignal("branch:proj-99", ["KEY:PROJ-99", "GH:42"]),
            new MatchSignal("commit:abc123", ["GH:42"]),
        ]);

        var group = Assert.Single(groups);
        Assert.Equal(["GH:42", "KEY:PROJ-99"], group.References.OrderBy(x => x));
    }

    [Fact]
    public void ASignalWithNoReferencesIsItsOwnGroup()
    {
        var groups = TicketMatching.Group([new MatchSignal("branch:redesign", [])]);

        var group = Assert.Single(groups);
        Assert.Equal(["branch:redesign"], group.SignalIds);
        Assert.Empty(group.References);
    }

    private static IReadOnlySet<string> Prefixes(params string[] prefixes) => prefixes.ToHashSet();
}
