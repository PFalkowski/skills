using System.Text.Json.Serialization;

namespace WhatsNext;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SourceKind
{
    GitHubIssues,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SourceOrigin
{
    Discovered,
    Confirmed,
    HandEntered,
}

public sealed record Source(string Id, SourceKind Kind, SourceOrigin Origin, string RepoSlug, string? ProjectKey);
