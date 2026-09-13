using System.Diagnostics;

namespace WhatsNext;

public sealed class SessionLauncher(IProcessStarter starter)
{
    public int LaunchAndWait(string workingDirectory, IReadOnlyList<string> claudeArgs)
    {
        _ = starter;
        throw new NotImplementedException();
    }
}
