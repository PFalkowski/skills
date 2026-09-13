using System.Diagnostics;

namespace WhatsNext.Tests;

internal sealed class LauncherTestEnvironment : IDisposable
{
    private readonly string _tempRoot;
    private readonly string _fakeBinDir;
    private readonly string _publishLogPath;

    public string AgentsStateRoot { get; }

    public LauncherTestEnvironment()
    {
        _tempRoot = Directory.CreateTempSubdirectory("wip-launcher-").FullName;
        AgentsStateRoot = Path.Combine(_tempRoot, "agents-state");
        _publishLogPath = Path.Combine(_tempRoot, "publish.log");
        _fakeBinDir = Path.Combine(_tempRoot, "fakebin");
        Directory.CreateDirectory(_fakeBinDir);

        if (OperatingSystem.IsWindows())
        {
            File.WriteAllText(
                Path.Combine(_fakeBinDir, "dotnet.cmd"),
                "@echo off\r\npwsh -NoProfile -File \"%~dp0FakeDotnet.ps1\" %*\r\nexit /b %ERRORLEVEL%\r\n");
            File.WriteAllText(Path.Combine(_fakeBinDir, "FakeDotnet.ps1"), FakeDotnetScript);
        }
        else
        {
            var dotnetPath = Path.Combine(_fakeBinDir, "dotnet");
            File.WriteAllText(dotnetPath, FakeDotnetShellScript.ReplaceLineEndings("\n"));
            File.SetUnixFileMode(
                dotnetPath,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute |
                UnixFileMode.GroupRead | UnixFileMode.GroupExecute |
                UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
        }
    }

    public (int ExitCode, string StdOut) RunLauncher(bool sdkAvailable, int childExitCode, params string[] args)
    {
        var whatsNextRoot = FindWhatsNextRoot();
        var launcherPath = Path.Combine(whatsNextRoot, "scripts", "wip.ps1");

        var startInfo = new ProcessStartInfo("pwsh")
        {
            WorkingDirectory = whatsNextRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(launcherPath);
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        startInfo.Environment["AGENTS_STATE"] = AgentsStateRoot;
        startInfo.Environment["PATH"] = _fakeBinDir + Path.PathSeparator + Environment.GetEnvironmentVariable("PATH");
        startInfo.Environment["FAKE_DOTNET_NO_SDK"] = sdkAvailable ? "" : "1";
        startInfo.Environment["FAKE_DOTNET_LOG"] = _publishLogPath;
        startInfo.Environment["FAKE_EXIT_CODE"] = childExitCode.ToString();

        using var process = Process.Start(startInfo)!;
        var stdOut = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        return (process.ExitCode, stdOut);
    }

    public int PublishInvocationCount() =>
        File.Exists(_publishLogPath) ? File.ReadAllLines(_publishLogPath).Length : 0;

    public void Dispose()
    {
        try
        {
            Directory.Delete(_tempRoot, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    private static string FindWhatsNextRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "WhatsNext.sln")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName
            ?? throw new InvalidOperationException("Could not locate whats-next root above " + AppContext.BaseDirectory);
    }

    private const string FakeDotnetScript = """
        $argv = $args
        if ($argv.Count -ge 1 -and $argv[0] -eq '--list-sdks') {
            if ($env:FAKE_DOTNET_NO_SDK -eq '1') { exit 0 }
            Write-Output '10.0.400 [C:\fake\sdk]'
            exit 0
        }
        if ($argv.Count -ge 1 -and $argv[0] -eq 'publish') {
            Add-Content -Path $env:FAKE_DOTNET_LOG -Value ('publish ' + ($argv -join ' '))
            $oIndex = [Array]::IndexOf($argv, '-o')
            $outDir = $argv[$oIndex + 1]
            New-Item -ItemType Directory -Force -Path $outDir | Out-Null
            New-Item -ItemType File -Force -Path (Join-Path $outDir 'WhatsNext.dll') | Out-Null
            exit 0
        }
        if ($argv.Count -ge 1 -and $argv[0] -like '*WhatsNext.dll') {
            Write-Output ('FAKE_RUN ' + ($argv -join ' '))
            exit ([int]$env:FAKE_EXIT_CODE)
        }
        exit 99
        """;

    // Same fake behaviour as FakeDotnetScript above, ported to POSIX shell: on non-Windows,
    // pwsh resolves `dotnet` by executable bit, not by PATHEXT, so the fake must be a real
    // executable named exactly "dotnet" rather than a "dotnet.cmd" pwsh would never find.
    private const string FakeDotnetShellScript = """
        #!/usr/bin/env bash
        set -eu
        if [ "$1" = "--list-sdks" ]; then
            if [ "${FAKE_DOTNET_NO_SDK:-}" != "1" ]; then
                echo "10.0.400 [/fake/sdk]"
            fi
            exit 0
        fi
        if [ "$1" = "publish" ]; then
            echo "publish $*" >> "$FAKE_DOTNET_LOG"
            prev=""
            out_dir=""
            for a in "$@"; do
                if [ "$prev" = "-o" ]; then out_dir="$a"; fi
                prev="$a"
            done
            mkdir -p "$out_dir"
            touch "$out_dir/WhatsNext.dll"
            exit 0
        fi
        case "$1" in
            *WhatsNext.dll)
                echo "FAKE_RUN $*"
                exit "${FAKE_EXIT_CODE:-0}"
                ;;
        esac
        exit 99
        """;
}
