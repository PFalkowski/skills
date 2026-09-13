namespace WhatsNext;

public sealed record RepositoryGroup(string Root, string Name, string? Slug, IReadOnlyList<string> Worktrees);
