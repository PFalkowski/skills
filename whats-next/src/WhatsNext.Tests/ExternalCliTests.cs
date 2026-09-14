using Xunit;

namespace WhatsNext.Tests;

public class ExternalCliTests
{
    [Fact]
    public void Run_ArgumentContainingSpaceAndQuote_ArrivesAsOneArgument()
    {
        var cli = new ProcessExternalCli();
        var tempRoot = Directory.CreateTempSubdirectory("wip-externalcli-").FullName;
        var targetDir = Path.Combine(tempRoot, "repo with space and 'quote");

        var result = cli.Run(tempRoot, "git", ["init", targetDir]);

        Assert.Equal(0, result.ExitCode);
        Assert.True(Directory.Exists(Path.Combine(targetDir, ".git")));
    }

    [Fact]
    public void Run_BareNameOnlyAvailableAsACmdShim_ResolvesOnWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var binDir = Directory.CreateTempSubdirectory("wip-externalcli-bin-").FullName;
        var workDir = Directory.CreateTempSubdirectory("wip-externalcli-work-").FullName;
        File.WriteAllText(Path.Combine(binDir, "faketool.cmd"), "@echo off\r\necho hello from %cd%\r\n");

        var originalPath = Environment.GetEnvironmentVariable("PATH");
        try
        {
            Environment.SetEnvironmentVariable("PATH", binDir + Path.PathSeparator + originalPath);

            var cli = new ProcessExternalCli();
            var result = cli.Run(workDir, "faketool", []);

            Assert.Equal(0, result.ExitCode);
            Assert.Contains(result.StdOutLines, line => line.Contains(workDir));
        }
        finally
        {
            Environment.SetEnvironmentVariable("PATH", originalPath);
            Directory.Delete(binDir, recursive: true);
            Directory.Delete(workDir, recursive: true);
        }
    }
}
