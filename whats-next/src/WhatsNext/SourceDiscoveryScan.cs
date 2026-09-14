namespace WhatsNext;

// ADR-0003 "Config provenance and discovery": the scan step for S1's one provider (GitHub
// remote -> GitHub Issues candidate). The input fingerprint gates the whole scan, including the
// "gh installed" probe, so an unchanged repository makes no IExternalCli calls at all.
public static class SourceDiscoveryScan
{
    public const string AlgorithmVersion = "1";

    public static (ConfigFile Config, DiscoveryFile Discovery) Run(
        IExternalCli cli, string repositoryDirectory, string? remoteUrl, ConfigFile config, DiscoveryFile discovery)
    {
        var remotes = remoteUrl is null ? [] : new[] { remoteUrl };
        var inputFingerprint = SourceDiscoveryRun.InputFingerprint(remotes, [], [], [], AlgorithmVersion);
        if (inputFingerprint == discovery.LastInputFingerprint)
        {
            return (config, discovery);
        }

        var updatedDiscovery = discovery with { LastInputFingerprint = inputFingerprint };
        var slug = remoteUrl is null ? null : GitHubPullRequestFetch.FormatGitHubSlug(remoteUrl);
        if (slug is null || cli.Run(repositoryDirectory, "gh", ["--version"]).ExitCode != 0)
        {
            return (config, updatedDiscovery);
        }

        var candidate = new SourceCandidate(SourceKind.GitHubIssues, slug, null);
        var identityFingerprint = SourceDiscoveryRun.IdentityFingerprint(candidate);
        var alreadyOffered = discovery.DeclinedFingerprints.Contains(identityFingerprint)
            || config.Sources.Any(s => s.Kind == candidate.Kind && s.RepoSlug == candidate.RepoSlug);
        if (alreadyOffered)
        {
            return (config, updatedDiscovery);
        }

        var source = new Source(Guid.NewGuid().ToString(), SourceKind.GitHubIssues, SourceOrigin.Discovered, slug, null);
        return (config with { Sources = [.. config.Sources, source] }, updatedDiscovery);
    }
}
