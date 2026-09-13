namespace WhatsNext;

// Ports Invoke-Prune (wip.ps1 at 5fe502c). Takes already-discovered repository groups and live
// sessions (RepositoryDiscovery), so a test can supply real, hand-built repositories without
// depending on the machine's own transcript directory.
public static class PrunePipeline
{
    private static readonly IReadOnlyCollection<string> HoldingWorkReasons =
        ["uncommitted changes", "unmerged commits", "ignored files present"];

    public static void Run(
        IExternalCli cli,
        TextWriter output,
        IReadOnlyList<RepositoryGroup> repos,
        IReadOnlyList<LiveSession> liveSessions,
        string currentDirectory,
        bool apply,
        bool includeIgnored,
        bool fetch)
    {
        var rows = BuildCandidates(cli, repos, liveSessions, currentDirectory, includeIgnored, fetch);
        var removable = rows.Where(row => row.Removable).ToList();
        var holdingWork = rows.Where(row => HoldingWorkReasons.Contains(row.Reason)).ToList();

        if (!fetch)
        {
            output.WriteLine("Branches deleted on the remote are recognised only as far as your last fetch. Add -Fetch to refresh.");
            output.WriteLine();
        }

        if (removable.Count == 0)
        {
            output.WriteLine($"Nothing safe to remove. {rows.Count} worktree(s) examined.");
        }
        else
        {
            output.WriteLine($"{removable.Count} worktree(s) safe to remove:");
            foreach (var row in removable)
            {
                output.WriteLine($"  {row.Repo,-24} {row.Path}  ({row.Reason})");
            }
        }
        output.WriteLine();

        if (holdingWork.Count > 0)
        {
            output.WriteLine($"{holdingWork.Count} kept because removing them would destroy something:");
            foreach (var row in holdingWork)
            {
                output.WriteLine($"  {row.Repo,-24} {row.Path}  ({row.Reason})");
            }
            output.WriteLine();
        }

        if (!apply)
        {
            output.WriteLine($"Nothing was removed. Re-run with -Apply to remove the {removable.Count} listed above.");
            return;
        }

        foreach (var row in removable)
        {
            output.WriteLine(PruneExecution.Apply(cli, row));
        }
    }

    private static List<PruneCandidate> BuildCandidates(
        IExternalCli cli,
        IReadOnlyList<RepositoryGroup> repos,
        IReadOnlyList<LiveSession> liveSessions,
        string currentDirectory,
        bool includeIgnored,
        bool fetch)
    {
        var livePaths = liveSessions.Select(session => session.Cwd).OfType<string>().ToList();
        var rows = new List<PruneCandidate>();

        foreach (var repo in repos)
        {
            if (fetch)
            {
                cli.Run(repo.Root, "git", ["fetch", "--prune", "--quiet"]);
            }

            var remote = repo.Slug is not null ? GitHubPullRequestFetch.Fetch(cli, repo.Root, repo.OriginUrl) : null;
            var defaultRef = DefaultRef.Resolve(cli, repo.Root, remote?.DefaultBranch);
            var mergedHeads = remote?.MergedHeads ?? [];

            foreach (var path in repo.Worktrees)
            {
                var fact = WorktreeFactReader.Read(cli, path, new SystemClock());
                rows.Add(WorktreeRemoval.Evaluate(
                    cli, repo.Name, repo.Root, fact, currentDirectory, defaultRef, mergedHeads, livePaths, includeIgnored));
            }
        }

        return rows;
    }
}
