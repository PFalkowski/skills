using Xunit;

namespace WhatsNext.Tests;

public class ProcessLaunchTests
{
    [Fact]
    public void LaunchAndWait_SetsWorkingDirectoryAndInheritsConsole()
    {
        var starter = new FakeProcessStarter(exitCode: 0);
        var launcher = new SessionLauncher(starter);

        launcher.LaunchAndWait("/some/worktree", ["-n", "label"]);

        var startInfo = starter.LastStartInfo!;
        Assert.Equal("/some/worktree", startInfo.WorkingDirectory);
        Assert.False(startInfo.RedirectStandardOutput);
        Assert.False(startInfo.RedirectStandardError);
        Assert.False(startInfo.RedirectStandardInput);
        Assert.False(startInfo.UseShellExecute);
    }

    [Fact]
    public void LaunchAndWait_PassesArgsElementwise()
    {
        var starter = new FakeProcessStarter(exitCode: 0);
        var launcher = new SessionLauncher(starter);

        launcher.LaunchAndWait("/dir", ["-r", "abc-123", "-n", "repo branch"]);

        Assert.Equal(["-r", "abc-123", "-n", "repo branch"], starter.LastStartInfo!.ArgumentList);
    }

    [Fact]
    public void LaunchAndWait_ReturnsChildExitCode()
    {
        var starter = new FakeProcessStarter(exitCode: 7);
        var launcher = new SessionLauncher(starter);

        var exitCode = launcher.LaunchAndWait("/dir", ["-n", "label"]);

        Assert.Equal(7, exitCode);
    }
}
