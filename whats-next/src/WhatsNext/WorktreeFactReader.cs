using System.Text.RegularExpressions;

namespace WhatsNext;

public static partial class WorktreeFactReader
{
    private static readonly string[] StatusArgs = ["status", "--porcelain=v2", "--branch", "--ignored=matching"];
    private static readonly string[] AgeArgs = ["log", "-1", "--format=%ct"];

    // git marks an in-progress rebase/bisect/cherry-pick/revert with one of these files or
    // directories under the worktree's own admin directory.
    private static readonly string[] OperationMarkers =
        ["rebase-merge", "rebase-apply", "BISECT_LOG", "CHERRY_PICK_HEAD", "MERGE_HEAD", "REVERT_HEAD", "sequencer"];

    public static WorktreeFact Read(IExternalCli cli, string path, IClock clock)
    {
        if (!Directory.Exists(path))
        {
            return MissingFact(path);
        }

        var status = cli.Run(path, "git", StatusArgs);
        if (status.ExitCode != 0)
        {
            return MissingFact(path);
        }

        var adminDirectory = ResolveAdminDirectory(path);
        if (adminDirectory is null)
        {
            return MissingFact(path);
        }

        var age = cli.Run(path, "git", AgeArgs);
        var ageSeconds = age.ExitCode == 0 && age.StdOutLines.Count > 0 ? age.StdOutLines[0] : null;

        return Parse(path, status.StdOutLines, adminDirectory, ageSeconds);
    }

    private static WorktreeFact MissingFact(string path) => new(
        path, Missing: true, IsMain: false, Locked: false, Branch: null, Detached: false,
        Upstream: null, UpstreamGone: false, Ahead: 0, Behind: 0, Dirty: false, DirtyCount: 0,
        IgnoredCount: 0, HeadOid: null, LastCommitAge: null, OperationInProgress: false);

    private static WorktreeFact Parse(string path, IReadOnlyList<string> statusLines, string adminDirectory, string? ageSeconds)
    {
        var isMain = Directory.Exists(adminDirectory) &&
            string.Equals(Path.GetFileName(adminDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)), ".git", StringComparison.Ordinal);
        var locked = Path.Exists(Path.Combine(adminDirectory, "locked"));
        var operationInProgress = OperationMarkers.Any(marker => Path.Exists(Path.Combine(adminDirectory, marker)));

        string? branch = null;
        var detached = false;
        string? upstream = null;
        var ahead = 0;
        var behind = 0;
        string? headOid = null;
        var dirtyCount = 0;
        var ignoredCount = 0;
        var sawAheadBehind = false;

        foreach (var line in statusLines)
        {
            if (string.IsNullOrEmpty(line))
            {
                continue;
            }
            if (line.StartsWith('!'))
            {
                ignoredCount++;
                continue;
            }
            if (!line.StartsWith('#'))
            {
                dirtyCount++;
                continue;
            }

            var parts = line.Split((char[]?)null, 3, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 3)
            {
                continue;
            }

            switch (parts[1])
            {
                case "branch.oid":
                    headOid = parts[2];
                    break;
                case "branch.head":
                    if (parts[2] == "(detached)")
                    {
                        detached = true;
                    }
                    else
                    {
                        branch = parts[2];
                    }
                    break;
                case "branch.upstream":
                    upstream = parts[2];
                    break;
                case "branch.ab":
                    sawAheadBehind = true;
                    var match = AheadBehindPattern().Match(parts[2]);
                    if (match.Success)
                    {
                        ahead = int.Parse(match.Groups[1].Value);
                        behind = int.Parse(match.Groups[2].Value);
                    }
                    break;
            }
        }

        // git omits branch.ab when the upstream it still has configured no longer exists on the
        // remote.
        var upstreamGone = upstream is not null && !sawAheadBehind;

        TimeSpan? lastCommitAge = null;
        if (ageSeconds is not null && long.TryParse(ageSeconds, out var epochSeconds))
        {
            lastCommitAge = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(epochSeconds);
        }

        return new WorktreeFact(
            path, Missing: false, isMain, locked, branch, detached, upstream, upstreamGone,
            ahead, behind, Dirty: dirtyCount > 0, dirtyCount, ignoredCount, headOid, lastCommitAge,
            operationInProgress);
    }

    private static string? ResolveAdminDirectory(string path)
    {
        var dotGit = Path.Combine(path, ".git");
        if (Directory.Exists(dotGit))
        {
            return dotGit;
        }
        if (!File.Exists(dotGit))
        {
            return null;
        }

        using var reader = new StreamReader(dotGit);
        var firstLine = reader.ReadLine() ?? string.Empty;
        var match = GitDirPointerPattern().Match(firstLine);
        return match.Success ? match.Groups[1].Value.Trim() : null;
    }

    [GeneratedRegex(@"^\+(\d+)\s+-(\d+)$")]
    private static partial Regex AheadBehindPattern();

    [GeneratedRegex(@"^gitdir:\s*(.+)$")]
    private static partial Regex GitDirPointerPattern();
}
