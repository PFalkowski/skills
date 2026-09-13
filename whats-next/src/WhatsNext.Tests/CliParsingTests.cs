using System.Diagnostics;
using Xunit;

namespace WhatsNext.Tests;

public class CliParsingTests
{
    [Theory]
    [InlineData("-h")]
    [InlineData("--help")]
    public void Help_PrintsUsageAndExitsZero(string helpFlag)
    {
        var result = RunCli(helpFlag);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("Usage", result.StdOut);
    }

    // Ports Test-Interactive (wip.ps1 at 5fe502c): CI set, a redirected stream, or a
    // non-interactive session all mean "not interactive".
    [Theory]
    [InlineData(true, false, true, null, false)]
    [InlineData(false, true, true, null, false)]
    [InlineData(false, false, true, "true", false)]
    [InlineData(false, false, false, null, false)]
    [InlineData(false, false, true, null, true)]
    public void IsInteractive_ReflectsConsoleAndEnvironmentState(
        bool inputRedirected, bool outputRedirected, bool userInteractive, string? ci, bool expected)
    {
        Assert.Equal(expected, InteractiveConsole.IsInteractive(inputRedirected, outputRedirected, userInteractive, ci));
    }

    private static (int ExitCode, string StdOut) RunCli(params string[] args)
    {
        var dllPath = Path.Combine(AppContext.BaseDirectory, "WhatsNext.dll");
        var startInfo = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add(dllPath);
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = Process.Start(startInfo)!;
        var stdOut = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        return (process.ExitCode, stdOut);
    }
}
