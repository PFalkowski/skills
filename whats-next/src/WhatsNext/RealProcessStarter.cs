using System.Diagnostics;

namespace WhatsNext;

public sealed class RealProcessStarter : IProcessStarter
{
    public IStartedProcess Start(ProcessStartInfo startInfo)
    {
        if (OperatingSystem.IsWindows())
        {
            startInfo.FileName = ResolveWindowsShim(startInfo.FileName);
        }

        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException($"Failed to start '{startInfo.FileName}'.");
        return new StartedProcess(process);
    }

    // CreateProcess only appends .exe to an extension-less name; an npm-installed CLI like
    // `claude` is a .cmd shim, so Process.Start("claude") fails with "cannot find the file
    // specified" even though a shell's own command lookup finds it fine.
    private static string ResolveWindowsShim(string fileName)
    {
        if (Path.HasExtension(fileName) || fileName.Contains(Path.DirectorySeparatorChar) || fileName.Contains(Path.AltDirectorySeparatorChar))
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

    private sealed class StartedProcess(Process process) : IStartedProcess
    {
        public int ExitCode => process.ExitCode;

        public void WaitForExit() => process.WaitForExit();
    }
}
