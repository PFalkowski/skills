namespace WhatsNext;

// Ports Get-DefaultRef (wip.ps1 at 5fe502c): try the remote's own default branch first, then
// origin/HEAD's symbolic ref, then the two conventional names, and take the first one that
// actually resolves in this repository.
public static class DefaultRef
{
    public static string? Resolve(IExternalCli cli, string repoRoot, string? branchName)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrEmpty(branchName))
        {
            candidates.Add($"origin/{branchName}");
        }

        var symbolic = cli.Run(repoRoot, "git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
        if (symbolic.ExitCode == 0 && symbolic.StdOutLines.Count > 0)
        {
            candidates.Add(symbolic.StdOutLines[0]);
        }

        candidates.Add("origin/main");
        candidates.Add("origin/master");

        foreach (var reference in candidates.Distinct())
        {
            if (cli.Run(repoRoot, "git", ["rev-parse", "--verify", "--quiet", reference]).ExitCode == 0)
            {
                return reference;
            }
        }

        return null;
    }
}
