using System.Text.Json;

namespace WhatsNext;

public static class TranscriptReader
{
    private const int MaxLinesPerFile = 20;

    public static TranscriptHint? ReadHint(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return null;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(line);
        }
        catch (JsonException)
        {
            return null;
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var cwd = GetString(root, "cwd");
            return string.IsNullOrEmpty(cwd) ? null : new TranscriptHint(cwd, GetString(root, "sessionId"), GetString(root, "gitBranch"));
        }
    }

    public static IReadOnlyList<TranscriptSession> ReadSessions(string projectsRoot, int sinceDays = 14, DateTimeOffset? now = null)
    {
        if (!Directory.Exists(projectsRoot))
        {
            return [];
        }

        var cutoff = (now ?? DateTimeOffset.UtcNow).AddDays(-sinceDays).UtcDateTime;
        var sessions = new List<TranscriptSession>();

        foreach (var projectDirectory in Directory.EnumerateDirectories(projectsRoot))
        {
            foreach (var file in Directory.EnumerateFiles(projectDirectory, "*.jsonl"))
            {
                var written = File.GetLastWriteTimeUtc(file);
                if (written < cutoff)
                {
                    continue;
                }

                if (FirstHint(file) is { } hint)
                {
                    sessions.Add(new TranscriptSession(hint.Cwd, Path.GetFileNameWithoutExtension(file), written));
                }
            }
        }

        return sessions;
    }

    private static TranscriptHint? FirstHint(string file)
    {
        try
        {
            var lineNumber = 0;
            foreach (var line in File.ReadLines(file))
            {
                if (++lineNumber > MaxLinesPerFile)
                {
                    break;
                }
                if (ReadHint(line) is { } hint)
                {
                    return hint;
                }
            }
        }
        catch (IOException)
        {
        }

        return null;
    }

    private static string? GetString(JsonElement node, string property) =>
        node.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
