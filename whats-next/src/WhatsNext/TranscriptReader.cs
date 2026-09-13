namespace WhatsNext;

public static class TranscriptReader
{
    public static TranscriptHint? ReadHint(string line) => throw new NotImplementedException();

    public static IReadOnlyList<TranscriptSession> ReadSessions(string projectsRoot, int sinceDays = 14, DateTimeOffset? now = null) =>
        throw new NotImplementedException();
}
