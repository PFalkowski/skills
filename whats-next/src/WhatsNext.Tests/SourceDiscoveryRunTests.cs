using Xunit;

namespace WhatsNext.Tests;

// ADR-0003 "Config provenance and discovery": the identity fingerprint decides whether one
// specific candidate was already offered (stable across a re-run or reorder, changes only when
// the identity itself changes, never carries the raw discovered string or the answer given);
// the input fingerprint decides whether discovery runs at all (stable across reordering the
// same inputs, changes when any input actually changes). One field must never serve both jobs.
public class SourceDiscoveryRunTests
{
    private static readonly SourceCandidate GitHubIssuesCandidate =
        new(SourceKind.GitHubIssues, "owner/repo", "PROJ");

    [Fact]
    public void IdentityFingerprint_SameCandidateTwice_ProducesTheSameFingerprint()
    {
        var first = SourceDiscoveryRun.IdentityFingerprint(GitHubIssuesCandidate);
        var second = SourceDiscoveryRun.IdentityFingerprint(GitHubIssuesCandidate with { });

        Assert.Equal(first, second);
    }

    [Fact]
    public void IdentityFingerprint_DifferentRepoSlug_ProducesADifferentFingerprint()
    {
        var first = SourceDiscoveryRun.IdentityFingerprint(GitHubIssuesCandidate);
        var second = SourceDiscoveryRun.IdentityFingerprint(GitHubIssuesCandidate with { RepoSlug = "owner/other" });

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void IdentityFingerprint_NeverContainsTheRawIdentityFields()
    {
        var fingerprint = SourceDiscoveryRun.IdentityFingerprint(GitHubIssuesCandidate);

        Assert.DoesNotContain("owner/repo", fingerprint);
        Assert.DoesNotContain("PROJ", fingerprint);
    }

    [Fact]
    public void InputFingerprint_SameInputsInADifferentOrder_ProducesTheSameFingerprint()
    {
        var first = SourceDiscoveryRun.InputFingerprint(
            remotes: ["origin-a", "origin-b"],
            docFileHashes: ["hash-1", "hash-2"],
            mcpServers: ["server-a"],
            authenticatedClis: ["gh", "az"],
            algorithmVersion: "1");
        var second = SourceDiscoveryRun.InputFingerprint(
            remotes: ["origin-b", "origin-a"],
            docFileHashes: ["hash-2", "hash-1"],
            mcpServers: ["server-a"],
            authenticatedClis: ["az", "gh"],
            algorithmVersion: "1");

        Assert.Equal(first, second);
    }

    [Fact]
    public void InputFingerprint_AChangedRemote_ProducesADifferentFingerprint()
    {
        var first = SourceDiscoveryRun.InputFingerprint(
            remotes: ["origin-a"],
            docFileHashes: [],
            mcpServers: [],
            authenticatedClis: [],
            algorithmVersion: "1");
        var second = SourceDiscoveryRun.InputFingerprint(
            remotes: ["origin-a-moved"],
            docFileHashes: [],
            mcpServers: [],
            authenticatedClis: [],
            algorithmVersion: "1");

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void InputFingerprint_AChangedAlgorithmVersion_ProducesADifferentFingerprint()
    {
        var first = SourceDiscoveryRun.InputFingerprint(
            remotes: [], docFileHashes: [], mcpServers: [], authenticatedClis: [], algorithmVersion: "1");
        var second = SourceDiscoveryRun.InputFingerprint(
            remotes: [], docFileHashes: [], mcpServers: [], authenticatedClis: [], algorithmVersion: "2");

        Assert.NotEqual(first, second);
    }
}
