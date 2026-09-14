namespace WhatsNext;

public sealed record PruneCandidate(string Repo, string Root, string Path, bool Removable, string Reason);
