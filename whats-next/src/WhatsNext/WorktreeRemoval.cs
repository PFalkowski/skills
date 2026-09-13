namespace WhatsNext;

public static class WorktreeRemoval
{
    public static PruneCandidate Evaluate(
        IExternalCli cli,
        string repo,
        string root,
        WorktreeFact fact,
        string currentDirectory,
        string? defaultRef,
        IReadOnlyList<MergedPullRequestHead> mergedHeads,
        IReadOnlyList<string> liveSessionPaths,
        bool allowIgnored)
    {
        PruneCandidate No(string reason) => new(repo, root, fact.Path, false, reason);
        PruneCandidate Yes(string reason) => new(repo, root, fact.Path, true, reason);

        if (fact.Missing)
        {
            return No("directory missing");
        }
        if (fact.IsMain)
        {
            return No("main worktree");
        }
        if (fact.Locked)
        {
            return No("locked");
        }
        if (fact.OperationInProgress)
        {
            return No("operation in progress");
        }
        if (fact.Dirty)
        {
            return No("uncommitted changes");
        }

        var target = TrimTrailingSlash(Path.GetFullPath(fact.Path));
        var here = TrimTrailingSlash(Path.GetFullPath(currentDirectory));
        if (string.Equals(here, target, StringComparison.OrdinalIgnoreCase) ||
            here.StartsWith(target + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            return No("current worktree");
        }

        if (liveSessionPaths.Any(sessionPath => TrimTrailingSlash(sessionPath) == target))
        {
            return No("session open here");
        }

        if (fact.IgnoredCount > 0 && !allowIgnored)
        {
            return No("ignored files present");
        }

        if (string.IsNullOrEmpty(defaultRef))
        {
            return No("no default branch");
        }
        if (cli.Run(fact.Path, "git", ["rev-parse", "--verify", "--quiet", defaultRef]).ExitCode != 0)
        {
            return No("no default branch");
        }

        var defaultBranch = StripRemotePrefix(defaultRef);
        if (fact.Branch == defaultBranch)
        {
            return No("default branch");
        }

        if (cli.Run(fact.Path, "git", ["merge-base", "--is-ancestor", "HEAD", defaultRef]).ExitCode == 0)
        {
            return Yes("merged");
        }

        if (fact.Branch is not null && fact.Upstream is not null && fact.HeadOid is not null &&
            mergedHeads.Any(head => head.Head == fact.Branch && head.Oid == fact.HeadOid))
        {
            return Yes("merged pull request");
        }

        return No("unmerged commits");
    }

    private static string StripRemotePrefix(string @ref)
    {
        var slash = @ref.IndexOf('/');
        return slash < 0 ? @ref : @ref[(slash + 1)..];
    }

    private static string TrimTrailingSlash(string path) =>
        path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
}
