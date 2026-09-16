using Xunit;

namespace WhatsNext.Tests;

// ADR-0003 "Config provenance and discovery": the scan step that turns a discovered GitHub
// remote into a real config.json Source (AC1), gated by the input fingerprint so an unchanged
// repository skips the scan entirely (AC5).
public class SourceDiscoveryScanTests
{
    [Fact]
    public void Run_RepositoryWithGitHubRemoteAndNoExistingConfig_AddsADiscoveredGitHubIssuesSource()
    {
        using var fixture = new GitFixture();
        fixture.Git(fixture.Repo, "remote", "set-url", "origin", "https://github.com/owner/repo.git");
        var remoteUrl = fixture.Git(fixture.Repo, "remote", "get-url", "origin").StdOutLines[0];
        var cli = new FakeExternalCli();

        var (config, _) = SourceDiscoveryScan.Run(cli, fixture.Repo, remoteUrl, new ConfigFile(), new DiscoveryFile());

        var source = Assert.Single(config.Sources);
        Assert.Equal(SourceKind.GitHubIssues, source.Kind);
        Assert.Equal(SourceOrigin.Discovered, source.Origin);
        Assert.Equal("owner/repo", source.RepoSlug);
    }

    [Fact]
    public void Run_NoGitHubRemote_ProducesNoCandidate()
    {
        var cli = new FakeExternalCli();

        var (config, _) = SourceDiscoveryScan.Run(cli, "/repo", remoteUrl: null, new ConfigFile(), new DiscoveryFile());

        Assert.Empty(config.Sources);
    }

    [Fact]
    public void Run_GhNotInstalled_ProducesNoCandidate()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], ["gh: command not found"]));

        var (config, _) = SourceDiscoveryScan.Run(
            cli, "/repo", "https://github.com/owner/repo.git", new ConfigFile(), new DiscoveryFile());

        Assert.Empty(config.Sources);
    }

    [Fact]
    public void Run_UnchangedInputFingerprint_SkipsTheScanEntirelyAndMakesNoExternalCliCalls()
    {
        const string remoteUrl = "https://github.com/owner/repo.git";
        var fingerprint = SourceDiscoveryRun.InputFingerprint([remoteUrl], [], [], [], SourceDiscoveryScan.AlgorithmVersion);
        var discovery = new DiscoveryFile { LastInputFingerprint = fingerprint };
        var config = new ConfigFile();
        var cli = new FakeExternalCli();

        var (resultConfig, resultDiscovery) = SourceDiscoveryScan.Run(cli, "/repo", remoteUrl, config, discovery);

        Assert.Equal(config, resultConfig);
        Assert.Equal(discovery, resultDiscovery);
        Assert.Equal(0, cli.RunCallCount);
    }

    [Fact]
    public void Run_ChangedInputFingerprint_RecordsTheNewInputFingerprintForTheNextRun()
    {
        const string remoteUrl = "https://github.com/owner/repo.git";
        var cli = new FakeExternalCli();

        var (_, discovery) = SourceDiscoveryScan.Run(cli, "/repo", remoteUrl, new ConfigFile(), new DiscoveryFile());

        var expected = SourceDiscoveryRun.InputFingerprint([remoteUrl], [], [], [], SourceDiscoveryScan.AlgorithmVersion);
        Assert.Equal(expected, discovery.LastInputFingerprint);
    }

    [Fact]
    public void Run_DeclinedIdentityFingerprint_NeverOffersTheCandidateAgain()
    {
        const string remoteUrl = "https://github.com/owner/repo.git";
        var identityFingerprint = SourceDiscoveryRun.IdentityFingerprint(
            new SourceCandidate(SourceKind.GitHubIssues, "owner/repo", null));
        var discovery = new DiscoveryFile { DeclinedFingerprints = [identityFingerprint] };
        var cli = new FakeExternalCli();

        var (config, _) = SourceDiscoveryScan.Run(cli, "/repo", remoteUrl, new ConfigFile(), discovery);

        Assert.Empty(config.Sources);
    }

    [Fact]
    public void Run_CorrectedIdentityFingerprint_IsOfferedAgainAfterADecline()
    {
        var staleIdentityFingerprint = SourceDiscoveryRun.IdentityFingerprint(
            new SourceCandidate(SourceKind.GitHubIssues, "owner/old-repo", null));
        var discovery = new DiscoveryFile { DeclinedFingerprints = [staleIdentityFingerprint] };
        var cli = new FakeExternalCli();

        var (config, _) = SourceDiscoveryScan.Run(
            cli, "/repo", "https://github.com/owner/new-repo.git", new ConfigFile(), discovery);

        var source = Assert.Single(config.Sources);
        Assert.Equal("owner/new-repo", source.RepoSlug);
    }

    [Fact]
    public void Run_DeclineInOneRepositoryNeverSuppressesTheSameCandidateDiscoveredInAnotherRepository()
    {
        const string remoteUrl = "https://github.com/owner/repo.git";
        var identityFingerprint = SourceDiscoveryRun.IdentityFingerprint(
            new SourceCandidate(SourceKind.GitHubIssues, "owner/repo", null));
        var declinedElsewhere = new DiscoveryFile { DeclinedFingerprints = [identityFingerprint] };
        var neverDeclinedHere = new DiscoveryFile();
        var cli = new FakeExternalCli();

        var (repoA, _) = SourceDiscoveryScan.Run(cli, "/repo-a", remoteUrl, new ConfigFile(), declinedElsewhere);
        var (repoB, _) = SourceDiscoveryScan.Run(cli, "/repo-b", remoteUrl, new ConfigFile(), neverDeclinedHere);

        Assert.Empty(repoA.Sources);
        Assert.Single(repoB.Sources);
    }

    [Fact]
    public void Run_RemoteUnchangedButConfigAlreadyHasAnAcceptedSourceForIt_DoesNotAddADuplicateSource()
    {
        const string remoteUrl = "https://github.com/owner/repo.git";
        var config = new ConfigFile
        {
            Sources = [new Source("existing-id", SourceKind.GitHubIssues, SourceOrigin.Discovered, "owner/repo", null)],
        };
        var discovery = new DiscoveryFile { LastInputFingerprint = "stale-fingerprint-from-an-unrelated-input-change" };
        var cli = new FakeExternalCli();

        var (resultConfig, _) = SourceDiscoveryScan.Run(cli, "/repo", remoteUrl, config, discovery);

        Assert.Single(resultConfig.Sources);
    }
}
