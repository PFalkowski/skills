using System.Text.Json;

namespace WhatsNext;

public sealed class StartItemRunner(SessionLauncher launcher, TextWriter output)
{
    public int Run(string boardFilePath, int number)
    {
        var items = ReadBoard(boardFilePath);
        if (number < 1 || number > items.Count)
        {
            throw new InvalidOperationException($"Pick a number between 1 and {items.Count}.");
        }

        var entry = items[number - 1];
        if (!Directory.Exists(entry.Path))
        {
            throw new InvalidOperationException($"{entry.Path} is gone. Run wip to rebuild the board.");
        }

        var label = string.IsNullOrEmpty(entry.Branch)
            ? $"{entry.Repo} {entry.Kind}"
            : $"{entry.Repo} {entry.Branch}";

        IReadOnlyList<string> claudeArgs;
        if (string.IsNullOrEmpty(entry.SessionId))
        {
            output.WriteLine($"-> {entry.Path}  (new session)");
            claudeArgs = ["-n", label];
        }
        else
        {
            output.WriteLine($"-> {entry.Path}  (resuming {entry.SessionId})");
            claudeArgs = ["-r", entry.SessionId, "-n", label];
        }

        return launcher.LaunchAndWait(entry.Path, claudeArgs);
    }

    private static IReadOnlyList<BoardEntry> ReadBoard(string boardFilePath)
    {
        if (!File.Exists(boardFilePath))
        {
            throw new InvalidOperationException("No board yet. Run wip first.");
        }

        using var stream = OpenForSharedRead(boardFilePath);
        return JsonSerializer.Deserialize<List<BoardEntry>>(stream) ?? [];
    }

    private static FileStream OpenForSharedRead(string path) =>
        new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
}
