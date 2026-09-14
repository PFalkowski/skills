using Xunit;

namespace WhatsNext.Tests;

public class ProcessLaunchTests
{
    [Fact]
    public void LaunchAndWait_RunsClaudeAttachedInTheTargetDirectory()
    {
        var cli = new FakeExternalCli(attachedExitCode: 0);
        var launcher = new SessionLauncher(cli);

        launcher.LaunchAndWait("/some/worktree", ["-n", "label"]);

        var call = cli.LastRunAttached!.Value;
        Assert.Equal("/some/worktree", call.WorkingDirectory);
        Assert.Equal("claude", call.FileName);
        Assert.Equal(["-n", "label"], call.Args);
    }

    [Fact]
    public void LaunchAndWait_PassesArgsElementwise()
    {
        var cli = new FakeExternalCli(attachedExitCode: 0);
        var launcher = new SessionLauncher(cli);

        launcher.LaunchAndWait("/dir", ["-r", "abc-123", "-n", "repo branch"]);

        Assert.Equal(["-r", "abc-123", "-n", "repo branch"], cli.LastRunAttached!.Value.Args);
    }

    [Fact]
    public void LaunchAndWait_ReturnsChildExitCode()
    {
        var cli = new FakeExternalCli(attachedExitCode: 7);
        var launcher = new SessionLauncher(cli);

        var exitCode = launcher.LaunchAndWait("/dir", ["-n", "label"]);

        Assert.Equal(7, exitCode);
    }
}
