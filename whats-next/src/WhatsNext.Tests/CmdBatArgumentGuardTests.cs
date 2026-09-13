using Xunit;

namespace WhatsNext.Tests;

public class CmdBatArgumentGuardTests
{
    private const string HostileArgument = "x\"&echo INJECTED>pwned.txt&\"";

    [Fact]
    public void Run_CmdTarget_HostileArgumentRefusedBeforeProcessStarts()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        using var fixture = new CmdStubFixture("@echo off\r\necho ran>>argv.log\r\n");
        var cli = new ProcessExternalCli();

        Assert.Throws<InvalidOperationException>(() => cli.Run(fixture.WorkDir, "faketool", [HostileArgument]));

        Assert.False(File.Exists(fixture.ArgvLogPath));
        Assert.False(File.Exists(Path.Combine(fixture.WorkDir, "pwned.txt")));
    }

    [Fact]
    public void RunAttached_CmdTarget_HostileArgumentRefusedBeforeProcessStarts()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        using var fixture = new CmdStubFixture("@echo off\r\necho ran>>argv.log\r\n");
        var cli = new ProcessExternalCli();

        Assert.Throws<InvalidOperationException>(() => cli.RunAttached(fixture.WorkDir, "faketool", [HostileArgument]));

        Assert.False(File.Exists(fixture.ArgvLogPath));
        Assert.False(File.Exists(Path.Combine(fixture.WorkDir, "pwned.txt")));
    }

    [Fact]
    public void Run_CmdTarget_HostileArgumentExceptionNamesProgramAndPositionNotContent()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        using var fixture = new CmdStubFixture("@echo off\r\n");
        var cli = new ProcessExternalCli();

        var ex = Assert.Throws<InvalidOperationException>(() => cli.Run(fixture.WorkDir, "faketool", ["safe", HostileArgument]));

        Assert.Contains("faketool", ex.Message);
        Assert.Contains("1", ex.Message);
        Assert.DoesNotContain(HostileArgument, ex.Message);
    }

    [Theory]
    [InlineData(":")]
    [InlineData("=")]
    [InlineData("@")]
    [InlineData(",")]
    public void Run_CmdTarget_AddedSafeCharacterArrivesUnchanged(string character)
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        using var fixture = new CmdStubFixture("@echo off\r\necho %*>>argv.log\r\n");
        var cli = new ProcessExternalCli();
        var argument = $"owner{character}name";

        cli.Run(fixture.WorkDir, "faketool", [argument]);

        var logged = File.ReadAllText(fixture.ArgvLogPath);
        Assert.Contains(argument, logged);
    }

    [Fact]
    public void Run_ExeTarget_HostileArgumentArrivesUnchanged()
    {
        using var fixture = new GitFixture();
        var cli = new ProcessExternalCli();

        var commit = cli.Run(fixture.Repo, "git", ["commit", "--allow-empty", "-m", HostileArgument]);

        Assert.Equal(0, commit.ExitCode);
        Assert.False(File.Exists(Path.Combine(fixture.Repo, "pwned.txt")));
        var log = cli.Run(fixture.Repo, "git", ["log", "-1", "--format=%B"]);
        Assert.Equal(HostileArgument, log.StdOutLines[0]);
    }

    private sealed class CmdStubFixture : IDisposable
    {
        public CmdStubFixture(string stubScript)
        {
            BinDir = Directory.CreateTempSubdirectory("wip-cmdguard-bin-").FullName;
            WorkDir = Directory.CreateTempSubdirectory("wip-cmdguard-work-").FullName;
            File.WriteAllText(Path.Combine(BinDir, "faketool.cmd"), stubScript);
            OriginalPath = Environment.GetEnvironmentVariable("PATH");
            Environment.SetEnvironmentVariable("PATH", BinDir + Path.PathSeparator + OriginalPath);
        }

        public string BinDir { get; }

        public string WorkDir { get; }

        public string ArgvLogPath => Path.Combine(WorkDir, "argv.log");

        private string? OriginalPath { get; }

        public void Dispose()
        {
            Environment.SetEnvironmentVariable("PATH", OriginalPath);
            Directory.Delete(BinDir, recursive: true);
            Directory.Delete(WorkDir, recursive: true);
        }
    }
}
