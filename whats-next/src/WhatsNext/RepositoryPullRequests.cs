namespace WhatsNext;

public sealed record RepositoryPullRequests(
    string? DefaultBranch,
    IReadOnlyList<MergedPullRequestHead> MergedHeads,
    IReadOnlyList<PullRequestFact> PullRequests);
