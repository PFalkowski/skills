namespace WhatsNext;

public sealed record PullRequestFact(
    int Number,
    string Title,
    string? Head,
    string Url,
    bool IsDraft,
    string Decision,
    string Mergeable,
    string? Rollup,
    int UnresolvedThreadCount);
