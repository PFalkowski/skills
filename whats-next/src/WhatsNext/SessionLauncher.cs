using System.Diagnostics;

namespace WhatsNext;

public sealed class SessionLauncher(IProcessStarter starter)
{
    public int LaunchAndWait(string workingDirectory, IReadOnlyList<string> claudeArgs)
    {
        var startInfo = new ProcessStartInfo("claude")
        {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
        };
        foreach (var arg in claudeArgs)
        {
            startInfo.ArgumentList.Add(arg);
        }

        var process = starter.Start(startInfo);
        process.WaitForExit();
        return process.ExitCode;
    }
}
