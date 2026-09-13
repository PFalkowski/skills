namespace WhatsNext;

public sealed record LiveSession(
    string? SessionId,
    string? Cwd,
    string? Kind,
    string? Name,
    string? State,
    string? Status);
