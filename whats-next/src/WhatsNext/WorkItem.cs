namespace WhatsNext;

public sealed record WorkItem(
    string Repo,
    string RepoRoot,
    int Rank,
    string Kind,
    string Label,
    string Path,
    string? Branch,
    string? SessionId,
    string? Url,
    bool AlreadyOpen);
