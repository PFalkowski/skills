using System.Text.Json;
using System.Text.Json.Serialization;

namespace WhatsNext;

public sealed record ConfigFile
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; init; } = CurrentSchemaVersion;
    public IReadOnlyList<Source> Sources { get; init; } = [];

    [JsonExtensionData]
    public IDictionary<string, JsonElement>? ExtensionData { get; set; }

    public static ConfigFile Read(string path)
    {
        if (!File.Exists(path))
        {
            return new ConfigFile();
        }

        var config = JsonSerializer.Deserialize<ConfigFile>(File.ReadAllText(path)) ?? new ConfigFile();
        return config.SchemaVersion < CurrentSchemaVersion
            ? config with { SchemaVersion = CurrentSchemaVersion }
            : config;
    }

    public static string? Write(string path, ConfigFile config)
    {
        if (config.SchemaVersion > CurrentSchemaVersion)
        {
            return $"config.json is at schema version {config.SchemaVersion}, newer than this build ({CurrentSchemaVersion}) understands; refusing to overwrite it.";
        }

        return AtomicWrite.WriteAllText(path, JsonSerializer.Serialize(config));
    }
}
