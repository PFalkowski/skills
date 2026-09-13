namespace WhatsNext;

public sealed class SessionLauncher(IExternalCli cli)
{
    public int LaunchAndWait(string workingDirectory, IReadOnlyList<string> claudeArgs) =>
        cli.RunAttached(workingDirectory, "claude", claudeArgs);
}
