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
