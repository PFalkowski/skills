using Xunit;

namespace WhatsNext.Tests;

// ADR-0003 "Config provenance and discovery": config.json carries a schemaVersion; an older
// version is upgraded in memory and rewritten at the current version on the next successful
// write, an unrecognized field survives a round trip unread, and a newer version than this
// build understands is read-only for the run (Write must refuse, never silently overwrite it).
public class ConfigFileTests
{
    [Fact]
    public void Read_NoExistingFile_ReturnsEmptyConfigAtCurrentSchemaVersion()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-configfile-").FullName, "config.json");

        var config = ConfigFile.Read(path);

        Assert.Equal(ConfigFile.CurrentSchemaVersion, config.SchemaVersion);
        Assert.Empty(config.Sources);
    }

    [Fact]
    public void Read_ThenWrite_UnrecognizedFieldSurvivesTheRoundTripUnread()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-configfile-").FullName, "config.json");
        File.WriteAllText(path, """{"SchemaVersion":1,"Sources":[],"FutureField":"kept"}""");

        var config = ConfigFile.Read(path);
        var error = ConfigFile.Write(path, config);

        Assert.Null(error);
        Assert.Contains("\"FutureField\":\"kept\"", File.ReadAllText(path));
    }

    [Fact]
    public void Read_OlderSchemaVersion_UpgradedInMemoryToCurrent()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-configfile-").FullName, "config.json");
        File.WriteAllText(path, """{"SchemaVersion":0,"Sources":[]}""");

        var config = ConfigFile.Read(path);

        Assert.Equal(ConfigFile.CurrentSchemaVersion, config.SchemaVersion);
    }

    [Fact]
    public void Write_NewerSchemaVersionThanCurrentBuildUnderstands_RefusesAndLeavesFileUnchanged()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-configfile-").FullName, "config.json");
        var original = """{"SchemaVersion":999,"Sources":[]}""";
        File.WriteAllText(path, original);
        var config = ConfigFile.Read(path);

        var error = ConfigFile.Write(path, config);

        Assert.NotNull(error);
        Assert.Contains("999", error);
        Assert.Equal(original, File.ReadAllText(path));
    }

    [Fact]
    public void Write_ThenRead_SourceRoundTripsWithAllFields()
    {
        var path = Path.Combine(Directory.CreateTempSubdirectory("wip-configfile-").FullName, "config.json");
        var source = new Source("github-issues:owner/repo", SourceKind.GitHubIssues, SourceOrigin.Discovered, "owner/repo", "PROJ");
        var config = new ConfigFile { Sources = [source] };

        var error = ConfigFile.Write(path, config);
        var reRead = ConfigFile.Read(path);

        Assert.Null(error);
        Assert.Equal([source], reRead.Sources);
    }
}
