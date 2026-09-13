using System.Diagnostics;

namespace WhatsNext;

public sealed class ProcessExternalCli : IExternalCli
{
    public ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        var startInfo = new ProcessStartInfo(fileName)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException($"Failed to start '{fileName}'.");
        var stdOutTask = process.StandardOutput.ReadToEndAsync();
        var stdErrTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();

        return new ExternalCliResult(
            process.ExitCode,
            SplitLines(stdOutTask.GetAwaiter().GetResult()),
            SplitLines(stdErrTask.GetAwaiter().GetResult()));
    }

    public int RunAttached(string workingDirectory, string fileName, IReadOnlyList<string> args) =>
        throw new NotImplementedException();

    private static IReadOnlyList<string> SplitLines(string text)
    {
        var lines = text.Split('\n').Select(line => line.TrimEnd('\r')).ToList();
        if (lines.Count > 0 && lines[^1].Length == 0)
        {
            lines.RemoveAt(lines.Count - 1);
        }
        return lines;
    }
}
