using System.Text.Json;

namespace WhatsNext;

public static class GitHubIssuesFetch
{
    private const string Query = """
        query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
        issues(filterBy:{assignee:"@me",states:OPEN},first:100){nodes{
        number title url state}}}}
        """;

    public static IReadOnlyList<TicketFact>? Fetch(IExternalCli cli, string workingDirectory, string repoSlug)
    {
        var slashIndex = repoSlug.IndexOf('/');
        var owner = repoSlug[..slashIndex];
        var name = repoSlug[(slashIndex + 1)..];

        var result = cli.Run(
            workingDirectory,
            "gh",
            ["api", "graphql", "-f", $"owner={owner}", "-f", $"name={name}", "-f", $"query={Query}"]);
        if (result.ExitCode != 0)
        {
            return null;
        }

        return Parse(string.Join('\n', result.StdOutLines));
    }

    private static IReadOnlyList<TicketFact>? Parse(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }

        using (document)
        {
            if (!document.RootElement.TryGetProperty("data", out var data) ||
                !data.TryGetProperty("repository", out var repository) ||
                repository.ValueKind != JsonValueKind.Object ||
                !repository.TryGetProperty("issues", out var issues) ||
                !issues.TryGetProperty("nodes", out var nodes))
            {
                return null;
            }

            return [.. nodes.EnumerateArray().Select(ParseIssue)];
        }
    }

    private static TicketFact ParseIssue(JsonElement node) => new(
        node.GetProperty("number").GetInt32(),
        node.GetProperty("title").GetString() ?? string.Empty,
        node.GetProperty("url").GetString() ?? string.Empty,
        node.GetProperty("state").GetString() ?? string.Empty);
}
