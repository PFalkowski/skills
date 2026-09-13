using Xunit;

namespace WhatsNext.Tests;

// Ports Invoke-Prune's own report/apply orchestration (wip.ps1 at 5fe502c) - no PowerShell test
// coverage today, so every case here is new coverage. Takes already-discovered repository groups
// (RepositoryDiscovery is the machine-wide discovery step), so real disposable repositories
// (GitFixture) can be supplied directly, never the test machine's own transcripts.
public class PrunePipelineTests
{
    [Fact]
    public void DryRunByDefault_ListsRemovableWorktreesButRemovesNothing()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("done-feature", mergeToMain: true);
        var repos = new[] { new RepositoryGroup(fx.Repo, "repo", null, null, [worktree]) };
        var output = new StringWriter();

        PrunePipeline.Run(new ProcessExternalCli(), new SystemClock(), output, repos, [], fx.Base, apply: false, includeIgnored: false, fetch: false);

        Assert.True(Directory.Exists(worktree));
        var text = output.ToString();
        Assert.Contains("1 worktree(s) safe to remove:", text);
        Assert.Contains(worktree, text);
        Assert.Contains("Nothing was removed. Re-run with -Apply to remove the 1 listed above.", text);
    }

    [Fact]
    public void Apply_RemovesTheListedCandidates()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("done-feature", mergeToMain: true);
        var repos = new[] { new RepositoryGroup(fx.Repo, "repo", null, null, [worktree]) };
        var output = new StringWriter();

        PrunePipeline.Run(new ProcessExternalCli(), new SystemClock(), output, repos, [], fx.Base, apply: true, includeIgnored: false, fetch: false);

        Assert.False(Directory.Exists(worktree));
        Assert.Contains($"removed {worktree}", output.ToString());
    }

    [Fact]
    public void HoldingWork_ListsADirtyWorktreeWithItsReason()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("in-progress");
        File.WriteAllText(Path.Combine(worktree, "scratch.txt"), "wip");
        var repos = new[] { new RepositoryGroup(fx.Repo, "repo", null, null, [worktree]) };
        var output = new StringWriter();

        PrunePipeline.Run(new ProcessExternalCli(), new SystemClock(), output, repos, [], fx.Base, apply: false, includeIgnored: false, fetch: false);

        var text = output.ToString();
        Assert.Contains("1 kept because removing them would destroy something:", text);
        Assert.Contains("uncommitted changes", text);
    }

    [Fact]
    public void WithoutFetch_PrintsTheFreshnessNotice()
    {
        using var fx = new GitFixture();
        var repos = new[] { new RepositoryGroup(fx.Repo, "repo", null, null, Array.Empty<string>()) };
        var output = new StringWriter();

        PrunePipeline.Run(new ProcessExternalCli(), new SystemClock(), output, repos, [], fx.Base, apply: false, includeIgnored: false, fetch: false);

        Assert.Contains("Add -Fetch to refresh.", output.ToString());
    }

    [Fact]
    public void WithFetch_OmitsTheFreshnessNotice()
    {
        using var fx = new GitFixture();
        var repos = new[] { new RepositoryGroup(fx.Repo, "repo", null, null, Array.Empty<string>()) };
        var output = new StringWriter();

        PrunePipeline.Run(new ProcessExternalCli(), new SystemClock(), output, repos, [], fx.Base, apply: false, includeIgnored: false, fetch: true);

        Assert.DoesNotContain("Add -Fetch to refresh.", output.ToString());
    }

    [Fact]
    public void NoWorktrees_PrintsNothingSafeToRemoveWithTheExaminedCount()
    {
        var repos = new[] { new RepositoryGroup("/repo", "repo", null, null, Array.Empty<string>()) };
        var output = new StringWriter();
        var cli = new FakeExternalCli(new ExternalCliResult(0, [], []));

        PrunePipeline.Run(cli, new SystemClock(), output, repos, [], "/repo", apply: false, includeIgnored: false, fetch: false);

        Assert.Contains("Nothing safe to remove. 0 worktree(s) examined.", output.ToString());
    }
}
