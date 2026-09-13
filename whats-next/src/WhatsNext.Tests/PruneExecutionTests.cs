using Xunit;

namespace WhatsNext.Tests;

// Review finding R5: Invoke-Prune's apply path (as opposed to Test-WorktreeRemovable's predicate,
// already covered by WorktreeRemovabilityTests) had zero automated coverage. Never passes
// --force; a worktree that turns dirty since the check yields "git refused, left alone"; a
// simulated partial OS-level removal (the one outcome a real git binary cannot be coerced into
// reliably) yields "REMOVAL FAILED PART WAY".
public class PruneExecutionTests
{
    [Fact]
    public void Apply_MergedCleanWorktree_RemovesItAndReportsRemoved()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("done-feature", mergeToMain: true);
        var candidate = new PruneCandidate("repo", fx.Repo, worktree, true, "merged");

        var message = PruneExecution.Apply(new ProcessExternalCli(), candidate);

        Assert.Equal($"removed {worktree}", message);
        Assert.False(Directory.Exists(worktree));
    }

    [Fact]
    public void Apply_WorktreeDirtySinceTheCheck_YieldsGitRefusedLeftAlone()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("in-flight-feature");
        File.WriteAllText(Path.Combine(worktree, "uncommitted.txt"), "surprise");
        var candidate = new PruneCandidate("repo", fx.Repo, worktree, true, "merged");

        var message = PruneExecution.Apply(new ProcessExternalCli(), candidate);

        Assert.Equal($"git refused, left alone: {worktree}", message);
        Assert.True(Directory.Exists(worktree));
    }

    [Fact]
    public void Apply_SimulatedPartialOSLevelRemoval_YieldsRemovalFailedPartWay()
    {
        var path = Directory.CreateTempSubdirectory("wn-partial-removal-").FullName;
        Directory.Delete(path);
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], ["error: could not remove ref"]));
        var candidate = new PruneCandidate("repo", "/some/root", path, true, "merged");

        var message = PruneExecution.Apply(cli, candidate);

        Assert.Equal($"REMOVAL FAILED PART WAY, an empty directory may remain: {path}", message);
    }

    [Fact]
    public void Apply_NeverPassesForceToGitWorktreeRemove()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [], []));
        var candidate = new PruneCandidate("repo", "/some/root", "/some/root/wt", true, "merged");

        PruneExecution.Apply(cli, candidate);

        Assert.Equal(["worktree", "remove", "/some/root/wt"], cli.LastRun!.Value.Args);
    }
}
