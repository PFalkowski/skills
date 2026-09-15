using System.Security.Cryptography;
using System.Text;

namespace WhatsNext;

// ADR-0003 "Config provenance and discovery": two fingerprints, two lifetimes, never merged.
// The identity fingerprint decides whether one specific candidate was already offered; the
// input fingerprint decides whether a discovery run is needed at all.
public static class SourceDiscoveryRun
{
    public static string IdentityFingerprint(SourceCandidate candidate) =>
        Hash(candidate.Kind, candidate.RepoSlug, candidate.ProjectKey ?? "");

    public static string InputFingerprint(
        IEnumerable<string> remotes,
        IEnumerable<string> docFileHashes,
        IEnumerable<string> mcpServers,
        IEnumerable<string> authenticatedClis,
        string algorithmVersion) =>
        Hash(
            string.Join(',', remotes.OrderBy(v => v, StringComparer.Ordinal)),
            string.Join(',', docFileHashes.OrderBy(v => v, StringComparer.Ordinal)),
            string.Join(',', mcpServers.OrderBy(v => v, StringComparer.Ordinal)),
            string.Join(',', authenticatedClis.OrderBy(v => v, StringComparer.Ordinal)),
            algorithmVersion);

    private static string Hash(params object[] fields)
    {
        var normalized = string.Join('', fields);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(bytes);
    }
}
