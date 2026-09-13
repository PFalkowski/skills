namespace WhatsNext;

public static class RepositoryGrouping
{
    public static IReadOnlyList<RepositoryGroup> From(IExternalCli cli, IReadOnlyList<string> directories)
    {
        var seenCommonDirectories = new HashSet<string>();
        var groups = new List<RepositoryGroup>();

        foreach (var directory in directories)
        {
            var commonDirResult = cli.Run(directory, "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
            if (commonDirResult.ExitCode != 0 || commonDirResult.StdOutLines.Count == 0)
            {
                continue;
            }

            var commonDirectory = NormalizeSeparators(commonDirResult.StdOutLines[0].TrimEnd('/', '\\'));
            if (!seenCommonDirectories.Add(commonDirectory))
            {
                continue;
            }

            var root = Path.GetDirectoryName(commonDirectory) ?? commonDirectory;
            var originResult = cli.Run(directory, "git", ["remote", "get-url", "origin"]);
            var originUrl = originResult.ExitCode == 0 && originResult.StdOutLines.Count > 0 ? originResult.StdOutLines[0] : null;
            var slug = GitHubPullRequestFetch.FormatGitHubSlug(originUrl);

            groups.Add(new RepositoryGroup(root, slug ?? Path.GetFileName(root), slug, WorktreePaths(cli, directory)));
        }

        return groups;
    }

    private static IReadOnlyList<string> WorktreePaths(IExternalCli cli, string repoRoot)
    {
        var listing = cli.Run(repoRoot, "git", ["worktree", "list", "--porcelain"]);
        if (listing.ExitCode != 0)
        {
            return [];
        }

        return [.. listing.StdOutLines
            .Where(line => line.StartsWith("worktree ", StringComparison.Ordinal))
            .Select(line => NormalizeSeparators(line[9..].Trim()))];
    }

    // `git rev-parse`/`git worktree list` always print forward slashes, even on Windows; every
    // other path in this codebase is OS-native, so board rows would fail to line up by RepoRoot
    // otherwise.
    private static string NormalizeSeparators(string path) => path.Replace('/', Path.DirectorySeparatorChar);
}
