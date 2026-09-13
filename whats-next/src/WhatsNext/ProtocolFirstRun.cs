namespace WhatsNext;

// Ports Invoke-ProtocolFirstRun (wip.ps1 at 5fe502c): Windows-only, one-time prompt for the
// wip:// protocol handler. An existing marker - including one left by the PowerShell version,
// since it is the same bare file at the same path - is always honoured, never re-asked.
public static class ProtocolFirstRun
{
    public static void Run(
        IExternalCli cli,
        string markerPath,
        bool interactive,
        TextReader input,
        TextWriter output,
        string? registerScriptPath)
    {
        if (!OperatingSystem.IsWindows() || File.Exists(markerPath))
        {
            return;
        }

        if (IsProtocolRegistered(cli))
        {
            AtomicWrite.WriteAllText(markerPath, string.Empty);
            return;
        }

        if (!interactive)
        {
            return;
        }

        output.WriteLine();
        output.Write("Register the wip:// protocol, so the report's Resume button launches directly instead of only copying? One-time, user-scope, no admin. [y/N] ");
        var answer = input.ReadLine();
        AtomicWrite.WriteAllText(markerPath, string.Empty);

        if (answer is not null && answer.TrimStart().StartsWith("y", StringComparison.OrdinalIgnoreCase))
        {
            if (registerScriptPath is not null)
            {
                cli.RunAttached(Path.GetDirectoryName(registerScriptPath)!, "pwsh", ["-NoProfile", "-File", registerScriptPath]);
            }
        }
        else
        {
            output.WriteLine("Skipped. Run register-protocol.ps1 any time to enable it later.");
        }
    }

    private static bool IsProtocolRegistered(IExternalCli cli) =>
        cli.Run(Path.GetTempPath(), "reg", ["query", @"HKCU\Software\Classes\wip\shell\open\command"]).ExitCode == 0;
}
