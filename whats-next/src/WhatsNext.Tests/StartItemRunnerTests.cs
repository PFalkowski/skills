using System.Text.Json;
using Xunit;

namespace WhatsNext.Tests;

public class StartItemRunnerTests
{
    [Fact]
    public void Run_NoBoardFile_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        var runner = new StartItemRunner(new SessionLauncher(new FakeProcessStarter(0)), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 1));

        Assert.Equal("No board yet. Run wip first.", ex.Message);
    }

    [Fact]
    public void Run_NumberOutOfRange_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new BoardEntry("repo", scratch.Path, 1, "pr", "label", scratch.Path, null, null, null, false));
        var runner = new StartItemRunner(new SessionLauncher(new FakeProcessStarter(0)), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 2));

        Assert.Equal("Pick a number between 1 and 1.", ex.Message);
    }

    [Fact]
    public void Run_PathGone_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        var goneDir = Path.Combine(scratch.Path, "gone");
        scratch.WriteBoard(new BoardEntry("repo", goneDir, 1, "pr", "label", goneDir, null, null, null, false));
        var runner = new StartItemRunner(new SessionLauncher(new FakeProcessStarter(0)), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 1));

        Assert.Equal($"{goneDir} is gone. Run wip to rebuild the board.", ex.Message);
    }

    [Fact]
    public void Run_EntryWithSessionId_ResumesAndPrintsHandoffLine()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new BoardEntry("myrepo", scratch.Path, 1, "pr", "label", scratch.Path, "feat/x", "sess-1", null, false));
        var starter = new FakeProcessStarter(exitCode: 5);
        var output = new StringWriter();
        var runner = new StartItemRunner(new SessionLauncher(starter), output);

        var exitCode = runner.Run(scratch.BoardFilePath, 1);

        Assert.Equal(5, exitCode);
        Assert.Equal(["-r", "sess-1", "-n", "myrepo feat/x"], starter.LastStartInfo!.ArgumentList);
        Assert.Contains($"-> {scratch.Path}  (resuming sess-1)", output.ToString());
    }

    [Fact]
    public void Run_EntryWithoutSessionId_StartsNewSessionAndPrintsHandoffLine()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new BoardEntry("myrepo", scratch.Path, 1, "worktree", "label", scratch.Path, null, null, null, false));
        var starter = new FakeProcessStarter(exitCode: 0);
        var output = new StringWriter();
        var runner = new StartItemRunner(new SessionLauncher(starter), output);

        runner.Run(scratch.BoardFilePath, 1);

        Assert.Equal(["-n", "myrepo worktree"], starter.LastStartInfo!.ArgumentList);
        Assert.Contains($"-> {scratch.Path}  (new session)", output.ToString());
    }

    private sealed class ScratchDirectory : IDisposable
    {
        public ScratchDirectory()
        {
            Path = Directory.CreateTempSubdirectory("wip-startitem-").FullName;
        }

        public string Path { get; }

        public string BoardFilePath => System.IO.Path.Combine(Path, "board.json");

        public void WriteBoard(params BoardEntry[] entries) =>
            File.WriteAllText(BoardFilePath, JsonSerializer.Serialize(entries));

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
