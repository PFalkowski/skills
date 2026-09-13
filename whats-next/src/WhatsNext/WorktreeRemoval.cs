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
        bool allowIgnored) =>
        throw new NotImplementedException();
}
