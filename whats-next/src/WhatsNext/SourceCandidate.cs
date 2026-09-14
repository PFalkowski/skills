namespace WhatsNext;

public sealed record SourceCandidate(SourceKind Kind, string RepoSlug, string? ProjectKey);
