using System.Runtime.CompilerServices;
using System.Text.Json;
using Xunit;

namespace WhatsNext.Tests;

public class EndToEndBoardSnapshotTests
{
    private const string TempRootPlaceholder = "FIXTURE_ROOT";

    [Fact]
    public void BoardMatchesSnapshot_ReRecordWithWHATSNEXT_UPDATE_SNAPSHOT()
    {
        using var fx = new GitFixture();

        var dirty = fx.AddBranch("dirty-worktree");
        File.AppendAllText(Path.Combine(dirty, "work.txt"), "uncommitted local edit\n");

        var unpushed = fx.AddBranch("unpushed-commits");

        var stale = fx.AddGoneUpstreamBranch("stale-worktree");
        fx.SetCommitAge(stale, daysAgo: 30);

        // Clock fixed well clear of that 30-day mark (not right on it) so the whole-day
        // truncation in the "stale" label can never flip with git's own second-level rounding
        // of the commit timestamp SetCommitAge just wrote.
        var clock = new FakeClock(DateTimeOffset.UtcNow.AddHours(12));

        // Same branch name as a real, already-squash-merged pull request in the captured fixture -
        // gone upstream and not otherwise stale, so it should surface no board item at all.
        var squashMergedLike = fx.AddGoneUpstreamBranch("feat/wip-theme-toggle-slider");

        var pushedNoPr = fx.AddBranch("pushed-without-pr", push: true);

        var claudeAgentsJson = JsonSerializer.Serialize(new[]
        {
            new { sessionId = "e2e-fixture-session", cwd = pushedNoPr, kind = "background", name = "pushed-without-pr", state = "running", status = "active" },
        });
        var gitHubResponse = File.ReadAllText(FixturePath("github-graphql-skills.json"));
        var cli = new FixtureBackedExternalCli(gitHubResponse, claudeAgentsJson);
        var liveSessions = LiveSessionFetch.Fetch(cli, fx.Repo);

        var repos = new[]
        {
            new RepositoryGroup(
                fx.Repo, "skills", "PFalkowski/skills", "https://github.com/PFalkowski/skills.git",
                [dirty, unpushed, stale, squashMergedLike, pushedNoPr]),
        };

        var items = Board.Build(cli, clock, repos, liveSessions, transcriptSessions: [], staleDays: 7);

        var actualJson = Serialize(items, fx.Base);

        if (Environment.GetEnvironmentVariable("WHATSNEXT_UPDATE_SNAPSHOT") == "1")
        {
            File.WriteAllText(FixturePath("end-to-end-board-snapshot.json"), actualJson);
            return;
        }

        var expectedJson = File.ReadAllText(FixturePath("end-to-end-board-snapshot.json"));
        Assert.Equal(NormalizeLineEndings(expectedJson), NormalizeLineEndings(actualJson));
    }

    private static string Serialize(IReadOnlyList<WorkItem> items, string tempRoot)
    {
        var normalized = items.Select(item => item with
        {
            RepoRoot = NormalizePath(item.RepoRoot, tempRoot),
            Path = NormalizePath(item.Path, tempRoot),
        });
        return JsonSerializer.Serialize(normalized, new JsonSerializerOptions { WriteIndented = true });
    }

    // The snapshot fixture is compared across OSes (CI runs Linux, this repo is authored on
    // Windows); RepositoryGrouping deliberately renders paths with the OS-native separator, so
    // the snapshot itself picks one separator to stay diff-stable everywhere.
    private static string NormalizePath(string path, string tempRoot) =>
        path.Replace(tempRoot, TempRootPlaceholder).Replace('\\', '/');

    private static string NormalizeLineEndings(string text) => text.Replace("\r\n", "\n");

    private static string FixturePath(string fileName, [CallerFilePath] string sourceFile = "") =>
        Path.Combine(Path.GetDirectoryName(sourceFile)!, "Fixtures", fileName);
}
