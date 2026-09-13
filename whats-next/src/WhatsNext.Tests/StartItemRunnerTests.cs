using System.Text.Json;
using Xunit;

namespace WhatsNext.Tests;

public class StartItemRunnerTests
{
    [Fact]
    public void Run_NoBoardFile_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        var runner = new StartItemRunner(new SessionLauncher(new FakeExternalCli()), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 1));

        Assert.Equal("No board yet. Run wip first.", ex.Message);
    }

    [Fact]
    public void Run_NumberOutOfRange_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new WorkItem("repo", scratch.Path, 1, "pr", "label", scratch.Path, null, null, null, false));
        var runner = new StartItemRunner(new SessionLauncher(new FakeExternalCli()), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 2));

        Assert.Equal("Pick a number between 1 and 1.", ex.Message);
    }

    [Fact]
    public void Run_PathGone_ThrowsWithExactMessage()
    {
        using var scratch = new ScratchDirectory();
        var goneDir = Path.Combine(scratch.Path, "gone");
        scratch.WriteBoard(new WorkItem("repo", goneDir, 1, "pr", "label", goneDir, null, null, null, false));
        var runner = new StartItemRunner(new SessionLauncher(new FakeExternalCli()), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 1));

        Assert.Equal($"{goneDir} is gone. Run wip to rebuild the board.", ex.Message);
    }

    [Fact]
    public void Run_EntryWithSessionId_ResumesAndPrintsHandoffLine()
    {
        using var scratch = new ScratchDirectory();
        var sessionId = Guid.NewGuid().ToString();
        scratch.WriteBoard(new WorkItem("myrepo", scratch.Path, 1, "pr", "label", scratch.Path, "feat/x", sessionId, null, false));
        var cli = new FakeExternalCli(attachedExitCode: 5);
        var output = new StringWriter();
        var runner = new StartItemRunner(new SessionLauncher(cli), output);

        var exitCode = runner.Run(scratch.BoardFilePath, 1);

        Assert.Equal(5, exitCode);
        Assert.Equal(["-r", sessionId, "-n", "myrepo feat/x"], cli.LastRunAttached!.Value.Args);
        Assert.Contains($"-> {scratch.Path}  (resuming {sessionId})", output.ToString());
    }

    [Fact]
    public void Run_EntryWithoutSessionId_StartsNewSessionAndPrintsHandoffLine()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new WorkItem("myrepo", scratch.Path, 1, "worktree", "label", scratch.Path, null, null, null, false));
        var cli = new FakeExternalCli(attachedExitCode: 0);
        var output = new StringWriter();
        var runner = new StartItemRunner(new SessionLauncher(cli), output);

        runner.Run(scratch.BoardFilePath, 1);

        Assert.Equal(["-n", "myrepo worktree"], cli.LastRunAttached!.Value.Args);
        Assert.Contains($"-> {scratch.Path}  (new session)", output.ToString());
    }

    [Fact]
    public void Run_NumberBeyondTheOldPerRankCutoff_ResolvesTheCorrectItem()
    {
        using var scratch = new ScratchDirectory();
        var beyondCutoffPath = Path.Combine(scratch.Path, "sixth");
        Directory.CreateDirectory(beyondCutoffPath);
        var entries = Enumerable.Range(1, 5)
            .Select(n => new WorkItem($"repo{n}", Path.Combine(scratch.Path, $"repo{n}"), 1, "pr", "label", Path.Combine(scratch.Path, $"repo{n}"), null, null, null, false))
            .Append(new WorkItem("sixth-repo", beyondCutoffPath, 1, "worktree", "label", beyondCutoffPath, null, null, null, false))
            .ToArray();
        scratch.WriteBoard(entries);
        var cli = new FakeExternalCli(attachedExitCode: 0);
        var output = new StringWriter();
        var runner = new StartItemRunner(new SessionLauncher(cli), output);

        runner.Run(scratch.BoardFilePath, 6);

        Assert.Equal(["-n", "sixth-repo worktree"], cli.LastRunAttached!.Value.Args);
        Assert.Contains($"-> {beyondCutoffPath}  (new session)", output.ToString());
    }

    [Fact]
    public void Run_EntryWithNonGuidSessionId_ThrowsWithExactMessageAndNeverLaunches()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new WorkItem("myrepo", scratch.Path, 1, "pr", "label", scratch.Path, "feat/x", "sess-1", null, false));
        var cli = new FakeExternalCli();
        var runner = new StartItemRunner(new SessionLauncher(cli), TextWriter.Null);

        var ex = Assert.Throws<InvalidOperationException>(() => runner.Run(scratch.BoardFilePath, 1));

        Assert.Equal("Session id in the board is invalid. Run wip to rebuild the board.", ex.Message);
        Assert.Null(cli.LastRunAttached);
    }

    private sealed class ScratchDirectory : IDisposable
    {
        public ScratchDirectory()
        {
            Path = Directory.CreateTempSubdirectory("wip-startitem-").FullName;
        }

        public string Path { get; }

        public string BoardFilePath => System.IO.Path.Combine(Path, "board.json");

        public void WriteBoard(params WorkItem[] entries) =>
            File.WriteAllText(BoardFilePath, JsonSerializer.Serialize(entries));

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
