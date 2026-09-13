using System.Diagnostics;

namespace WhatsNext.Tests;

internal sealed class FakeProcessStarter(int exitCode) : IProcessStarter
{
    public ProcessStartInfo? LastStartInfo { get; private set; }

    public IStartedProcess Start(ProcessStartInfo startInfo)
    {
        LastStartInfo = startInfo;
        return new FakeStartedProcess(exitCode);
    }

    private sealed class FakeStartedProcess(int exitCode) : IStartedProcess
    {
        public int ExitCode { get; } = exitCode;

        public void WaitForExit()
        {
        }
    }
}
