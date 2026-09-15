using Xunit;

namespace WhatsNext.Tests;

// ADR-0002: repos/<repo-slug>/discovery.json. ADR-0003 "Config provenance and discovery":
// same schemaVersion upgrade/preserve-unknown-field/refuse-newer rules as config.json (S1a's
// ConfigFileTests), applied here to declined identity fingerprints and the last input
// fingerprint.
public class DiscoveryFileTests
{
    [Fact]
    public void Read_NoExistingFile_ReturnsEmptyDiscoveryAtCurrentSchemaVersion()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-discoveryfile-").FullName, "discovery.json");

        var discovery = DiscoveryFile.Read(path);

        Assert.Equal(DiscoveryFile.CurrentSchemaVersion, discovery.SchemaVersion);
        Assert.Empty(discovery.DeclinedFingerprints);
        Assert.Null(discovery.LastInputFingerprint);
    }

    [Fact]
    public void Read_ThenWrite_UnrecognizedFieldSurvivesTheRoundTripUnread()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-discoveryfile-").FullName, "discovery.json");
        File.WriteAllText(path, """{"SchemaVersion":1,"DeclinedFingerprints":[],"FutureField":"kept"}""");

        var discovery = DiscoveryFile.Read(path);
        var error = DiscoveryFile.Write(path, discovery);

        Assert.Null(error);
        Assert.Contains("\"FutureField\":\"kept\"", File.ReadAllText(path));
    }

    [Fact]
    public void Read_OlderSchemaVersion_UpgradedInMemoryToCurrent()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-discoveryfile-").FullName, "discovery.json");
        File.WriteAllText(path, """{"SchemaVersion":0,"DeclinedFingerprints":[]}""");

        var discovery = DiscoveryFile.Read(path);

        Assert.Equal(DiscoveryFile.CurrentSchemaVersion, discovery.SchemaVersion);
    }

    [Fact]
    public void Write_NewerSchemaVersionThanCurrentBuildUnderstands_RefusesAndLeavesFileUnchanged()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-discoveryfile-").FullName, "discovery.json");
        var original = """{"SchemaVersion":999,"DeclinedFingerprints":[]}""";
        File.WriteAllText(path, original);
        var discovery = DiscoveryFile.Read(path);

        var error = DiscoveryFile.Write(path, discovery);

        Assert.NotNull(error);
        Assert.Contains("999", error);
        Assert.Equal(original, File.ReadAllText(path));
    }

    [Fact]
    public void Write_ThenRead_DeclinedFingerprintsAndLastInputFingerprintRoundTrip()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-discoveryfile-").FullName, "discovery.json");
        var discovery = new DiscoveryFile
        {
            DeclinedFingerprints = new HashSet<string> { "fingerprint-a", "fingerprint-b" },
            LastInputFingerprint = "input-fingerprint-1",
        };

        var error = DiscoveryFile.Write(path, discovery);
        var reRead = DiscoveryFile.Read(path);

        Assert.Null(error);
        Assert.Equal(discovery.DeclinedFingerprints, reRead.DeclinedFingerprints);
        Assert.Equal(discovery.LastInputFingerprint, reRead.LastInputFingerprint);
    }
}
