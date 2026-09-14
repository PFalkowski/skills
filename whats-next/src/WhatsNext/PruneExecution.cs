namespace WhatsNext;

// Ports Invoke-Prune's apply loop (wip.ps1 at 5fe502c). Never passes --force: git's own refusal
// is the last guard if a worktree turned dirty between the check and this call. Windows can also
// delete the files, lose the administrative entry, and still report failure, so a non-zero exit
// with the directory already gone is reported distinctly from a plain refusal.
public static class PruneExecution
{
    public static string Apply(IExternalCli cli, PruneCandidate candidate)
    {
        var result = cli.Run(candidate.Root, "git", ["worktree", "remove", candidate.Path]);
        if (result.ExitCode == 0)
        {
            return $"removed {candidate.Path}";
        }
        if (Directory.Exists(candidate.Path))
        {
            return $"git refused, left alone: {candidate.Path}";
        }
        return $"REMOVAL FAILED PART WAY, an empty directory may remain: {candidate.Path}";
    }
}
