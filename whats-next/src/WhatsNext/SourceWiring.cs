namespace WhatsNext;

// The last S1 sub-slice's composition: run SourceDiscoveryScan (S1d/S1e) per repository, gated
// by config.json/discovery.json already on disk, persist whichever of the two actually changed,
// and hand the resulting Sources to Board.Build so GitHubIssuesFetch/TicketMatching (S1b/S1f/S1g)
// fold ticket rows in.
public static class SourceWiring
{
    public static IReadOnlyList<Source> EnsureSources(IExternalCli cli, string stateRoot, IReadOnlyList<RepositoryGroup> repos)
    {
        var configPath = Path.Combine(stateRoot, "config.json");
        var config = ConfigFile.Read(configPath);
        var originalConfig = config;

        foreach (var repo in repos)
        {
            if (repo.Slug is null)
            {
                continue;
            }

            var discoveryPath = Path.Combine(stateRoot, "repos", repo.Slug, "discovery.json");
            var discovery = DiscoveryFile.Read(discoveryPath);
            (config, var updatedDiscovery) = SourceDiscoveryScan.Run(cli, repo.Root, repo.OriginUrl, config, discovery);

            if (!ReferenceEquals(updatedDiscovery, discovery))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(discoveryPath)!);
                DiscoveryFile.Write(discoveryPath, updatedDiscovery);
            }
        }

        if (!ReferenceEquals(config, originalConfig))
        {
            ConfigFile.Write(configPath, config);
        }

        return config.Sources;
    }
}
