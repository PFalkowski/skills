namespace WhatsNext;

// Ports the shared discovery steps both Show-Board and Invoke-Prune run at the top of wip.ps1
// (5fe502c): live sessions, recent transcripts, the directories worth grouping into repositories,
// and the repository groups themselves.
public static class RepositoryDiscovery
{
    public static (IReadOnlyList<RepositoryGroup> Repos, IReadOnlyList<LiveSession> LiveSessions, IReadOnlyList<TranscriptSession> TranscriptSessions) Discover(
        IExternalCli cli, string transcriptProjectsRoot, int sinceDays)
    {
        var liveSessions = LiveSessionFetch.Fetch(cli, transcriptProjectsRoot);
        var transcriptSessions = TranscriptReader.ReadSessions(transcriptProjectsRoot, sinceDays);
        var candidateDirectories = CandidateDirectories.From(liveSessions, transcriptSessions);
        var repos = RepositoryGrouping.From(cli, candidateDirectories);
        return (repos, liveSessions, transcriptSessions);
    }
}
