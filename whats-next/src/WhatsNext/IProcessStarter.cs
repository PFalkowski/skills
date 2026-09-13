using System.Diagnostics;

namespace WhatsNext;

public interface IProcessStarter
{
    IStartedProcess Start(ProcessStartInfo startInfo);
}

public interface IStartedProcess
{
    int ExitCode { get; }

    void WaitForExit();
}
