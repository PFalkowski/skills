using Xunit;

namespace WhatsNext.Tests;

// Get-TranscriptSession has no PowerShell test coverage today - new coverage this port adds,
// same shape as the other thin-layer tests (LiveSessionFetchTests, GitHubPullRequestFetchTests).
// Every fixture here is a synthetic .jsonl written by the test itself; a real transcript under
// ~/.claude/projects is never read.
public class TranscriptSessionReaderTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("wn-transcripts-").FullName;

    [Fact]
    public void ReadsTheWorkingDirectoryFromTheFirstLineThatHasOne()
    {
        WriteTranscript("proj", "abc", """
            {"note":"no cwd here"}
            {"cwd":"C:\\work\\one","sessionId":"abc"}
            {"cwd":"C:\\work\\two","sessionId":"abc"}
            """);

        var sessions = TranscriptReader.ReadSessions(_root, new SystemClock());

        var session = Assert.Single(sessions);
        Assert.Equal(@"C:\work\one", session.Cwd);
        Assert.Equal("abc", session.SessionId);
    }

    [Fact]
    public void OnlyTheFirstTwentyLinesAreEverLookedAt()
    {
        var lines = Enumerable.Range(1, 21).Select(i => i == 21
            ? """{"cwd":"C:\\too-late"}"""
            : """{"note":"filler"}""");
        WriteTranscript("proj", "late", string.Join('\n', lines));

        var sessions = TranscriptReader.ReadSessions(_root, new SystemClock());

        Assert.Empty(sessions);
    }

    [Fact]
    public void FilesOlderThanSinceDaysAreIgnored()
    {
        var file = WriteTranscript("proj", "old", """{"cwd":"C:\\work\\old"}""");
        File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddDays(-30));

        var sessions = TranscriptReader.ReadSessions(_root, new SystemClock(), sinceDays: 14);

        Assert.Empty(sessions);
    }

    [Fact]
    public void ABadLineNeverThrowsAndAGoodLineInTheSameFileStillWins()
    {
        WriteTranscript("proj", "mixed", "not json at all\n" + """{"cwd":"C:\\work\\mixed"}""");

        var sessions = TranscriptReader.ReadSessions(_root, new SystemClock());

        var session = Assert.Single(sessions);
        Assert.Equal(@"C:\work\mixed", session.Cwd);
    }

    [Fact]
    public void NoProjectsRootYieldsNoSessions()
    {
        var sessions = TranscriptReader.ReadSessions(Path.Combine(_root, "does-not-exist"), new SystemClock());

        Assert.Empty(sessions);
    }

    private string WriteTranscript(string projectDirectory, string sessionId, string content)
    {
        var directory = Path.Combine(_root, projectDirectory);
        Directory.CreateDirectory(directory);
        var file = Path.Combine(directory, $"{sessionId}.jsonl");
        File.WriteAllText(file, content);
        return file;
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}
