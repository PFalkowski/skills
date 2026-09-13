using System.Text.Json;
using Xunit;

namespace WhatsNext.Tests;

public class CommandInjectionTests
{
    // A real, valid git branch name (git check-ref-format --branch accepts it: branch names may
    // not contain spaces, but " and & are both legal) built the same way BatBadBut-class exploits
    // are: a quote breaks out of the argument .NET quoted for cmd.exe, exposing "&" as a fresh
    // command separator to a .cmd shim.
    private const string HostileBranch = "x\"&echo-INJECTED>pwned.txt&\"";

    [Fact]
    public void Run_HostileBranchName_LabelHandedToLauncherHasNoMetacharacters()
    {
        using var scratch = new ScratchDirectory();
        scratch.WriteBoard(new BoardEntry("myrepo", scratch.Path, 1, "worktree", "label", scratch.Path, HostileBranch, null, null, false));
        var cli = new FakeExternalCli();
        var runner = new StartItemRunner(new SessionLauncher(cli), TextWriter.Null);

        runner.Run(scratch.BoardFilePath, 1);

        var label = cli.LastRunAttached!.Value.Args[1];
        Assert.Matches("^[A-Za-z0-9 ._/-]*$", label);
    }

    [Fact]
    public void Run_HostileBranchName_NeverInjectsThroughARealCmdShim()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        using var scratch = new ScratchDirectory();
        var binDir = Directory.CreateTempSubdirectory("wip-injection-bin-").FullName;
        var pwnedFile = Path.Combine(scratch.Path, "pwned.txt");
        var argvLog = Path.Combine(scratch.Path, "argv.log");
        File.WriteAllText(Path.Combine(binDir, "claude.cmd"), "@echo off\r\necho %* >> argv.log\r\n");
        scratch.WriteBoard(new BoardEntry("myrepo", scratch.Path, 1, "worktree", "label", scratch.Path, HostileBranch, null, null, false));

        var originalPath = Environment.GetEnvironmentVariable("PATH");
        try
        {
            Environment.SetEnvironmentVariable("PATH", binDir + Path.PathSeparator + originalPath);
            var runner = new StartItemRunner(new SessionLauncher(new ProcessExternalCli()), TextWriter.Null);

            runner.Run(scratch.BoardFilePath, 1);

            Assert.False(File.Exists(pwnedFile));
            var recordedArgs = File.ReadAllText(argvLog);
            Assert.DoesNotMatch("[\"&|<>^!]", recordedArgs);
        }
        finally
        {
            Environment.SetEnvironmentVariable("PATH", originalPath);
            Directory.Delete(binDir, recursive: true);
        }
    }

    private sealed class ScratchDirectory : IDisposable
    {
        public ScratchDirectory()
        {
            Path = Directory.CreateTempSubdirectory("wip-injection-").FullName;
        }

        public string Path { get; }

        public string BoardFilePath => System.IO.Path.Combine(Path, "board.json");

        public void WriteBoard(params BoardEntry[] entries) =>
            File.WriteAllText(BoardFilePath, JsonSerializer.Serialize(entries));

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
