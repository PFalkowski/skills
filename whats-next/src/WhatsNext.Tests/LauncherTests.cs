using Xunit;

namespace WhatsNext.Tests;

public class LauncherTests
{
    [Fact]
    public void MissingSdk_PrintsMessageAndExitsOneWithoutBuilding()
    {
        using var env = new LauncherTestEnvironment();

        var result = env.RunLauncher(sdkAvailable: false, childExitCode: 0);

        Assert.Equal(1, result.ExitCode);
        Assert.Contains(
            ".NET 10 SDK not found. Install it from https://dotnet.microsoft.com/download/dotnet/10.0 and try again.",
            result.StdOut);
        Assert.Equal(0, env.PublishInvocationCount());
    }

    [Fact]
    public void ColdCache_BuildsOnce_ThenSkipsBuildOnRerunWithNoSourceChange()
    {
        using var env = new LauncherTestEnvironment();

        var first = env.RunLauncher(sdkAvailable: true, childExitCode: 42);
        Assert.Equal(42, first.ExitCode);
        Assert.Equal(1, env.PublishInvocationCount());

        var second = env.RunLauncher(sdkAvailable: true, childExitCode: 43);
        Assert.Equal(43, second.ExitCode);
        Assert.Equal(1, env.PublishInvocationCount());
    }
}
