using System.Text.Json;

namespace WhatsNext;

public static class LiveSessionFetch
{
    public static IReadOnlyList<LiveSession> Fetch(IExternalCli cli, string workingDirectory)
    {
        var result = cli.Run(workingDirectory, "claude", ["agents", "--json"]);
        if (result.ExitCode != 0)
        {
            return [];
        }

        return Parse(string.Join('\n', result.StdOutLines));
    }

    private static IReadOnlyList<LiveSession> Parse(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return [];
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return [.. document.RootElement.EnumerateArray().Select(ParseSession)];
        }
    }

    private static LiveSession ParseSession(JsonElement node) => new(
        GetString(node, "sessionId"),
        GetString(node, "cwd"),
        GetString(node, "kind"),
        GetString(node, "name"),
        GetString(node, "state"),
        GetString(node, "status"));

    private static string? GetString(JsonElement node, string property) =>
        node.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
