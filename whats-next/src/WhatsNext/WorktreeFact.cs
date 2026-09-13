namespace WhatsNext;

public sealed record WorktreeFact(
    string Path,
    bool Missing,
    bool IsMain,
    bool Locked,
    string? Branch,
    bool Detached,
    string? Upstream,
    bool UpstreamGone,
    int Ahead,
    int Behind,
    bool Dirty,
    int DirtyCount,
    int IgnoredCount,
    string? HeadOid,
    TimeSpan? LastCommitAge,
    bool OperationInProgress);
