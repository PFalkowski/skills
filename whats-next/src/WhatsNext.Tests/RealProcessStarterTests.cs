using System.Diagnostics;
using Xunit;

namespace WhatsNext.Tests;

public class RealProcessStarterTests
{
    [Fact]
    public void Start_BareNameResolvesToACmdShimOnWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var binDir = Directory.CreateTempSubdirectory("wip-realprocessstarter-bin-").FullName;
        var workDir = Directory.CreateTempSubdirectory("wip-realprocessstarter-work-").FullName;
        var markerFile = Path.Combine(binDir, "ran.txt");
        File.WriteAllText(
            Path.Combine(binDir, "faketool.cmd"),
            $"@echo off\r\necho %cd% > \"{markerFile}\"\r\nexit /b 3\r\n");

        var originalPath = Environment.GetEnvironmentVariable("PATH");
        try
        {
            Environment.SetEnvironmentVariable("PATH", binDir + Path.PathSeparator + originalPath);

            var starter = new RealProcessStarter();
            var startInfo = new ProcessStartInfo("faketool") { WorkingDirectory = workDir, UseShellExecute = false };
            var process = starter.Start(startInfo);
            process.WaitForExit();

            Assert.Equal(3, process.ExitCode);
            Assert.Equal(workDir, File.ReadAllText(markerFile).Trim());
        }
        finally
        {
            Environment.SetEnvironmentVariable("PATH", originalPath);
            Directory.Delete(binDir, recursive: true);
            Directory.Delete(workDir, recursive: true);
        }
    }
}
