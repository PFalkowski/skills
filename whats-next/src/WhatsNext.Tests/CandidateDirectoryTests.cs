using Xunit;

namespace WhatsNext.Tests;

// Get-CandidateDirectory has no PowerShell test coverage today - new coverage this port adds.
public class CandidateDirectoryTests : IDisposable
{
    private readonly List<string> _created = [];

    [Fact]
    public void LiveAndTranscriptSessionsBothContributeDirectories()
    {
        var liveDir = CreateNonTempDirectory();
        var transcriptDir = CreateNonTempDirectory();
        var live = new LiveSession("s1", liveDir, null, null, null, null);
        var transcript = new TranscriptSession(transcriptDir, "s2", DateTimeOffset.UtcNow);

        var directories = CandidateDirectories.From([live], [transcript]);

        Assert.Contains(liveDir, directories);
        Assert.Contains(transcriptDir, directories);
    }

    [Fact]
    public void ADirectoryUnderTheTempRootIsExcluded()
    {
        var tempChild = Directory.CreateTempSubdirectory("wn-cand-").FullName;
        try
        {
            var live = new LiveSession("s1", tempChild, null, null, null, null);

            Assert.Empty(CandidateDirectories.From([live], []));
        }
        finally
        {
            Directory.Delete(tempChild, recursive: true);
        }
    }

    [Fact]
    public void ADirectoryThatNoLongerExistsIsExcluded()
    {
        var gone = Path.Combine(AppContext.BaseDirectory, "wn-cand-does-not-exist-" + Guid.NewGuid());
        var live = new LiveSession("s1", gone, null, null, null, null);

        Assert.Empty(CandidateDirectories.From([live], []));
    }

    [Fact]
    public void DuplicateDirectoriesAppearOnce()
    {
        var directory = CreateNonTempDirectory();
        var live = new LiveSession("s1", directory, null, null, null, null);
        var transcript = new TranscriptSession(directory, "s2", DateTimeOffset.UtcNow);

        Assert.Single(CandidateDirectories.From([live], [transcript]));
    }

    private string CreateNonTempDirectory()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "wn-cand-" + Guid.NewGuid());
        Directory.CreateDirectory(path);
        _created.Add(path);
        return path;
    }

    public void Dispose()
    {
        foreach (var path in _created)
        {
            Directory.Delete(path, recursive: true);
        }
    }
}
