using Xunit;

namespace WhatsNext.Tests;

// Ports Invoke-ProtocolFirstRun (wip.ps1 at 5fe502c). Windows-only, so every case here is a no-op
// (and asserted as such) off Windows; "protocol registered" is checked through IExternalCli
// (`reg query`), never the real registry, via FakeExternalCli.
public class ProtocolFirstRunTests
{
    [Fact]
    public void MarkerAlreadyExists_NeverAsksAndNeverProbesTheRegistry()
    {
        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        File.WriteAllText(markerPath, string.Empty);
        var cli = new FakeExternalCli();
        var input = new StringReader("y\n");
        var output = new StringWriter();

        ProtocolFirstRun.Run(cli, markerPath, interactive: true, input, output, registerScriptPath: null);

        Assert.Equal(0, cli.RunCallCount);
        Assert.Empty(output.ToString());
    }

    [Fact]
    public void ExistingPowerShellEraMarker_StillCounts()
    {
        // Same bare, empty file at the same path the PowerShell version wrote - no format to port.
        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        File.WriteAllText(markerPath, string.Empty);
        var cli = new FakeExternalCli();

        ProtocolFirstRun.Run(cli, markerPath, interactive: true, TextReader.Null, TextWriter.Null, registerScriptPath: null);

        Assert.Equal(0, cli.RunCallCount);
    }

    [Fact]
    public void ProtocolAlreadyRegistered_WritesMarkerAndNeverAsks()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        var cli = new FakeExternalCli(new ExternalCliResult(0, [], []));
        var output = new StringWriter();

        ProtocolFirstRun.Run(cli, markerPath, interactive: true, TextReader.Null, output, registerScriptPath: null);

        Assert.True(File.Exists(markerPath));
        Assert.Empty(output.ToString());
    }

    [Fact]
    public void NotInteractive_NeverAsksAndNeverWritesMarker()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], []));
        var output = new StringWriter();

        ProtocolFirstRun.Run(cli, markerPath, interactive: false, TextReader.Null, output, registerScriptPath: null);

        Assert.False(File.Exists(markerPath));
        Assert.Empty(output.ToString());
    }

    [Fact]
    public void InteractiveAndUnregistered_AsksAndWritesMarkerRegardlessOfAnswer()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], []));
        var output = new StringWriter();

        ProtocolFirstRun.Run(cli, markerPath, interactive: true, new StringReader("n\n"), output, registerScriptPath: null);

        Assert.True(File.Exists(markerPath));
        Assert.Contains("[y/N]", output.ToString());
        Assert.Contains("Skipped.", output.ToString());
    }

    [Fact]
    public void InteractiveUnregisteredAndAnswerYes_RunsTheRegisterScript()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var scratch = Directory.CreateTempSubdirectory("wip-protocolfirstrun-").FullName;
        var markerPath = Path.Combine(scratch, "protocol-prompted");
        var scriptPath = Path.Combine(scratch, "register-protocol.ps1");
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], []));

        ProtocolFirstRun.Run(cli, markerPath, interactive: true, new StringReader("y\n"), TextWriter.Null, scriptPath);

        Assert.True(File.Exists(markerPath));
        Assert.NotNull(cli.LastRunAttached);
        Assert.Equal("pwsh", cli.LastRunAttached!.Value.FileName);
        Assert.Equal(["-NoProfile", "-File", scriptPath], cli.LastRunAttached.Value.Args);
    }
}
