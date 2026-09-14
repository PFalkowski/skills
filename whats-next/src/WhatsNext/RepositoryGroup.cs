namespace WhatsNext;

public sealed record RepositoryGroup(string Root, string Name, string? Slug, string? OriginUrl, IReadOnlyList<string> Worktrees);
