using System.Text.Json;
using System.Text.Json.Serialization;

namespace WhatsNext;

// ADR-0002: repos/<repo-slug>/discovery.json. ADR-0003 "Config provenance and discovery":
// declined fingerprints are keyed by identity fingerprint (the file already lives under one
// repo slug's directory); LastInputFingerprint gates whether a discovery run is needed at all.
// Same schema-upgrade/unknown-field-preservation/refuse-newer rule as ConfigFile.
public sealed record DiscoveryFile
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; init; } = CurrentSchemaVersion;
    public HashSet<string> DeclinedFingerprints { get; init; } = [];
    public string? LastInputFingerprint { get; init; }

    [JsonExtensionData]
    public IDictionary<string, JsonElement>? ExtensionData { get; set; }

    public static DiscoveryFile Read(string path)
    {
        if (!File.Exists(path))
        {
            return new DiscoveryFile();
        }

        var discovery = JsonSerializer.Deserialize<DiscoveryFile>(File.ReadAllText(path)) ?? new DiscoveryFile();
        return discovery.SchemaVersion < CurrentSchemaVersion
            ? discovery with { SchemaVersion = CurrentSchemaVersion }
            : discovery;
    }

    public static string? Write(string path, DiscoveryFile discovery)
    {
        if (discovery.SchemaVersion > CurrentSchemaVersion)
        {
            return $"discovery.json is at schema version {discovery.SchemaVersion}, newer than this build ({CurrentSchemaVersion}) understands; refusing to overwrite it.";
        }

        return AtomicWrite.WriteAllText(path, JsonSerializer.Serialize(discovery));
    }
}
