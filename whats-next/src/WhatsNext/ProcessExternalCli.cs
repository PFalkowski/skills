using System.Diagnostics;

namespace WhatsNext;

public sealed class ProcessExternalCli : IExternalCli
{
    public ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        using var process = Start(workingDirectory, fileName, args, redirect: true);
        var stdOutTask = process.StandardOutput.ReadToEndAsync();
        var stdErrTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();

        return new ExternalCliResult(
            process.ExitCode,
            SplitLines(stdOutTask.GetAwaiter().GetResult()),
            SplitLines(stdErrTask.GetAwaiter().GetResult()));
    }

    public int RunAttached(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        using var process = Start(workingDirectory, fileName, args, redirect: false);
        process.WaitForExit();
        return process.ExitCode;
    }

    private static Process Start(string workingDirectory, string fileName, IReadOnlyList<string> args, bool redirect)
    {
        var startInfo = new ProcessStartInfo(ResolveExecutable(fileName))
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = redirect,
            RedirectStandardError = redirect,
            UseShellExecute = false,
        };
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        return Process.Start(startInfo) ?? throw new InvalidOperationException($"Failed to start '{fileName}'.");
    }

    // CreateProcess only appends .exe to an extension-less name; an npm-installed CLI like
    // `claude` is a .cmd shim, so Process.Start("claude") fails with "cannot find the file
    // specified" even though a shell's own command lookup finds it fine.
    private static string ResolveExecutable(string fileName)
    {
        if (!OperatingSystem.IsWindows() ||
            Path.HasExtension(fileName) ||
            fileName.Contains(Path.DirectorySeparatorChar) ||
            fileName.Contains(Path.AltDirectorySeparatorChar))
        {
            return fileName;
        }

        var extensions = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").Split(';', StringSplitOptions.RemoveEmptyEntries);
        var directories = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty).Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (var directory in directories)
        {
            foreach (var extension in extensions)
            {
                var candidate = Path.Combine(directory, fileName + extension);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        return fileName;
    }

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
