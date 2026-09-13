using System.Diagnostics;

namespace WhatsNext;

public sealed class RealProcessStarter : IProcessStarter
{
    public IStartedProcess Start(ProcessStartInfo startInfo)
    {
        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException($"Failed to start '{startInfo.FileName}'.");
        return new StartedProcess(process);
    }

    private sealed class StartedProcess(Process process) : IStartedProcess
    {
        public int ExitCode => process.ExitCode;

        public void WaitForExit() => process.WaitForExit();
    }
}
