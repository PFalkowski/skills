using Xunit;

namespace WhatsNext.Tests;

// Plan §6, review R1: File.Move(tmp, final, overwrite: true) throws UnauthorizedAccessException
// while any process still has the destination open, on every FileShare mode - proven here with a
// real held-open handle from the test itself, never a mock.
public class AtomicWriteTests
{
    [Fact]
    public async Task WriteAllText_DestinationReleasedWithinTheBound_RetrySucceeds()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-atomicwrite-").FullName, "board.json");
        File.WriteAllText(path, "old");
        using var heldOpen = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None);

        var writeTask = Task.Run(() => AtomicWrite.WriteAllText(path, "new"));
        await Task.Delay(100);
        heldOpen.Dispose();

        var error = await writeTask;

        Assert.Null(error);
        Assert.Equal("new", File.ReadAllText(path));
    }

    [Fact]
    public async Task WriteAllText_DestinationHeldOpenLongerThanTheOldTwoHundredMillisecondBound_RetryStillSucceeds()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-atomicwrite-").FullName, "board.json");
        File.WriteAllText(path, "old");
        using var heldOpen = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None);

        var writeTask = Task.Run(() => AtomicWrite.WriteAllText(path, "new"));
        await Task.Delay(250);
        heldOpen.Dispose();

        var error = await writeTask;

        Assert.Null(error);
        Assert.Equal("new", File.ReadAllText(path));
    }

    [Fact]
    public void WriteAllText_DestinationHeldOpenForTheWholeBound_ReturnsCleanFailureNeverThrows()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-atomicwrite-").FullName, "board.json");
        File.WriteAllText(path, "old");
        string? error;
        using (new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            error = AtomicWrite.WriteAllText(path, "new");
        }

        Assert.NotNull(error);
        Assert.Contains(path, error);
        Assert.Equal("old", File.ReadAllText(path));
    }
}
