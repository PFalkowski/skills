namespace WhatsNext;

public static class CandidateDirectories
{
    public static IReadOnlyList<string> From(IReadOnlyList<LiveSession> liveSessions, IReadOnlyList<TranscriptSession> transcriptSessions)
    {
        var tempRoot = Path.GetTempPath().TrimEnd('/', '\\');
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var directories = new List<string>();

        foreach (var cwd in liveSessions.Select(session => session.Cwd).Concat(transcriptSessions.Select(session => session.Cwd)))
        {
            if (string.IsNullOrEmpty(cwd) || cwd.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if (Directory.Exists(cwd) && seen.Add(cwd))
            {
                directories.Add(cwd);
            }
        }

        return directories;
    }
}
