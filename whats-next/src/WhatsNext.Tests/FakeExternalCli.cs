namespace WhatsNext.Tests;

internal sealed class FakeExternalCli(ExternalCliResult runResult = default, int attachedExitCode = 0) : IExternalCli
{
    public (string WorkingDirectory, string FileName, IReadOnlyList<string> Args)? LastRun { get; private set; }

    public (string WorkingDirectory, string FileName, IReadOnlyList<string> Args)? LastRunAttached { get; private set; }

    public int RunCallCount { get; private set; }

    public ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        RunCallCount++;
        LastRun = (workingDirectory, fileName, args);
        return runResult;
    }

    public int RunAttached(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        LastRunAttached = (workingDirectory, fileName, args);
        return attachedExitCode;
    }
}
