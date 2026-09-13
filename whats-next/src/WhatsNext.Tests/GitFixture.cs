namespace WhatsNext.Tests;

// A throwaway remote plus a clone, so "merged", "upstream gone" and "unpushed" are real git
// states rather than stubs - the predicate's whole job is reading real git, so a mocked git
// layer would certify nothing.
internal sealed class GitFixture : IDisposable
{
    private readonly IExternalCli _cli = new ProcessExternalCli();

    public string Base { get; }

    public string Remote { get; }

    public string Repo { get; }

    public GitFixture()
    {
        Base = Directory.CreateTempSubdirectory("wn-t-").FullName;
        Remote = Path.Combine(Base, "remote");
        Repo = Path.Combine(Base, "repo");
        Directory.CreateDirectory(Remote);
        Git(Base, "init", "--bare", "-b", "main", Remote);
        Git(Base, "clone", Remote, Repo);
        Git(Repo, "config", "user.email", "test@example.invalid");
        Git(Repo, "config", "user.name", "test");
        File.WriteAllText(Path.Combine(Repo, ".gitignore"), "ignore-me/\n");
        File.WriteAllText(Path.Combine(Repo, "file.txt"), "one\n");
        Git(Repo, "add", "-A");
        Git(Repo, "commit", "-m", "initial");
        Git(Repo, "push", "-u", "origin", "main");
    }

    public string AddBranch(string branch, string? dir = null, bool push = false, bool mergeToMain = false)
    {
        var path = Path.Combine(Base, dir ?? branch.Replace('/', '-'));
        Git(Repo, "worktree", "add", "-b", branch, path, "main");
        File.WriteAllText(Path.Combine(path, "work.txt"), $"content of {branch}");
        Git(path, "add", "-A");
        Git(path, "commit", "-m", $"work on {branch}");
        if (push)
        {
            Git(path, "push", "-u", "origin", branch);
        }
        if (mergeToMain)
        {
            Git(Repo, "merge", "--no-ff", "-m", $"merge {branch}", branch);
            Git(Repo, "push", "origin", "main");
        }
        return path;
    }

    public WorktreeFact Fact(string path) => WorktreeFactReader.Read(_cli, path);

    public PruneCandidate Verdict(
        string path,
        string? @ref = "origin/main",
        IReadOnlyList<string>? merged = null,
        string? mergedOid = null,
        IReadOnlyList<string>? liveSessions = null,
        bool allowIgnored = false,
        string? currentDirectory = null)
    {
        var fact = Fact(path);
        var heads = (merged ?? []).Select(head => new MergedPullRequestHead(head, mergedOid ?? fact.HeadOid ?? string.Empty)).ToList();
        return WorktreeRemoval.Evaluate(
            _cli, "repo", Repo, fact, currentDirectory ?? Base, @ref, heads, liveSessions ?? [], allowIgnored);
    }

    public ExternalCliResult Git(string dir, params string[] args) => _cli.Run(dir, "git", args);

    public void Dispose()
    {
        try
        {
            Git(Repo, "worktree", "prune");
        }
        catch (InvalidOperationException)
        {
        }
        try
        {
            ClearReadOnlyAttributes(Base);
            Directory.Delete(Base, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
        }
    }

    // git marks some of its own object files read-only on Windows, which makes a plain recursive
    // delete fail; clear the attribute first the same way `Remove-Item -Force` does.
    private static void ClearReadOnlyAttributes(string root)
    {
        foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(file, FileAttributes.Normal);
        }
    }
}
