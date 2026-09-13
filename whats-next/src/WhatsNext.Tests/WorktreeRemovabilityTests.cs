using Xunit;

namespace WhatsNext.Tests;

// Ports WhatsNext.test.ps1's "prune predicate" and "facts" sections (45 checks) one-to-one
// against a real, disposable git repository per test - the predicate's whole job is reading
// real git, so a mocked git layer would certify nothing.
public class WorktreeRemovabilityTests
{
    [Fact]
    public void MergedAndCleanIsRemovable()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.True(fx.Verdict(merged).Removable);
    }

    [Fact]
    public void DirtyOnAMergedBranchIsNotRemovable()
    {
        using var fx = new GitFixture();
        var dirtyMerged = fx.AddBranch("dirty-merged", push: true, mergeToMain: true);
        File.AppendAllText(Path.Combine(dirtyMerged, "work.txt"), "uncommitted edit");

        Assert.False(fx.Verdict(dirtyMerged).Removable);
    }

    [Fact]
    public void DirtyReportsWhy()
    {
        using var fx = new GitFixture();
        var dirtyMerged = fx.AddBranch("dirty-merged", push: true, mergeToMain: true);
        File.AppendAllText(Path.Combine(dirtyMerged, "work.txt"), "uncommitted edit");

        Assert.Equal("uncommitted changes", fx.Verdict(dirtyMerged).Reason);
    }

    [Fact]
    public void UntrackedOnlyOnAMergedBranchIsNotRemovable()
    {
        using var fx = new GitFixture();
        var untracked = fx.AddBranch("untracked-merged", push: true, mergeToMain: true);
        File.WriteAllText(Path.Combine(untracked, "notes.txt"), "scratch notes nobody committed");

        Assert.False(fx.Verdict(untracked).Removable);
    }

    [Fact]
    public void ACleanWorktreeHoldingIgnoredFilesIsNotRemovable()
    {
        using var fx = new GitFixture();
        var ignored = fx.AddBranch("ignored-merged", push: true, mergeToMain: true);
        Directory.CreateDirectory(Path.Combine(ignored, "ignore-me"));
        File.WriteAllText(Path.Combine(ignored, "ignore-me", "settings.json"), "local settings nobody can regenerate");

        Assert.False(fx.Verdict(ignored).Removable);
    }

    [Fact]
    public void IgnoredReportsWhy()
    {
        using var fx = new GitFixture();
        var ignored = fx.AddBranch("ignored-merged", push: true, mergeToMain: true);
        Directory.CreateDirectory(Path.Combine(ignored, "ignore-me"));
        File.WriteAllText(Path.Combine(ignored, "ignore-me", "settings.json"), "local settings nobody can regenerate");

        Assert.Equal("ignored files present", fx.Verdict(ignored).Reason);
    }

    [Fact]
    public void AndGoesOnlyWhenExplicitlyAllowed()
    {
        using var fx = new GitFixture();
        var ignored = fx.AddBranch("ignored-merged", push: true, mergeToMain: true);
        Directory.CreateDirectory(Path.Combine(ignored, "ignore-me"));
        File.WriteAllText(Path.Combine(ignored, "ignore-me", "settings.json"), "local settings nobody can regenerate");

        Assert.True(fx.Verdict(ignored, allowIgnored: true).Removable);
    }

    [Fact]
    public void UnpushedAndUnmergedIsNotRemovable()
    {
        using var fx = new GitFixture();
        var unpushed = fx.AddBranch("never-pushed");

        Assert.False(fx.Verdict(unpushed).Removable);
    }

    [Fact]
    public void GoneUpstreamIsDetected()
    {
        using var fx = new GitFixture();
        var gone = AddGoneUpstream(fx, "gone-upstream");

        Assert.True(fx.Fact(gone).UpstreamGone);
    }

    [Fact]
    public void GoneUpstreamHoldingUniqueCommitsIsNotRemovable()
    {
        using var fx = new GitFixture();
        var gone = AddGoneUpstream(fx, "gone-upstream");

        Assert.False(fx.Verdict(gone).Removable);
    }

    [Fact]
    public void GoneUpstreamReportsWhy()
    {
        using var fx = new GitFixture();
        var gone = AddGoneUpstream(fx, "gone-upstream");

        Assert.Equal("unmerged commits", fx.Verdict(gone).Reason);
    }

    [Fact]
    public void ASquashMergedBranchIsNotAnAncestorSoAloneItIsNotRemovable()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.False(fx.Verdict(squashed).Removable);
    }

    [Fact]
    public void ButIsRemovableOnceTheForgeSaysItsPullRequestMerged()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.True(fx.Verdict(squashed, merged: ["squashed"]).Removable);
    }

    [Fact]
    public void AndReportsThatAsTheReason()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.Equal("merged pull request", fx.Verdict(squashed, merged: ["squashed"]).Reason);
    }

    [Fact]
    public void AnotherBranchNameInThatListDoesNotReleaseIt()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.False(fx.Verdict(squashed, merged: ["something-else"]).Removable);
    }

    [Fact]
    public void TheSameBranchNameAtADifferentCommitDoesNotReleaseIt()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.False(fx.Verdict(squashed, merged: ["squashed"], mergedOid: new string('0', 40)).Removable);
    }

    [Fact]
    public void ANameMatchOnTheWrongCommitReportsUnmergedCommits()
    {
        using var fx = new GitFixture();
        var squashed = AddSquashed(fx);

        Assert.Equal("unmerged commits", fx.Verdict(squashed, merged: ["squashed"], mergedOid: new string('0', 40)).Reason);
    }

    [Fact]
    public void ABranchThatWasNeverPushedCannotMatchAMergedPullRequest()
    {
        using var fx = new GitFixture();
        var neverPushed = fx.AddBranch("never-pushed");

        Assert.False(fx.Verdict(neverPushed, merged: ["never-pushed"]).Removable);
    }

    [Fact]
    public void AWorktreeWithASessionOpenInItIsNotRemovable()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.False(fx.Verdict(merged, liveSessions: [merged]).Removable);
    }

    [Fact]
    public void AndReportsTheOpenSessionAsTheReason()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.Equal("session open here", fx.Verdict(merged, liveSessions: [merged]).Reason);
    }

    [Fact]
    public void TheBisectFixtureIsRemovableBeforeTheBisectStarts()
    {
        using var fx = new GitFixture();
        var bisecting = fx.AddBranch("bisecting", push: true, mergeToMain: true);

        Assert.True(fx.Verdict(bisecting).Removable);
    }

    [Fact]
    public void AWorktreeMidBisectIsNotRemovable()
    {
        using var fx = new GitFixture();
        var bisecting = fx.AddBranch("bisecting", push: true, mergeToMain: true);
        fx.Git(bisecting, "bisect", "start");

        Assert.False(fx.Verdict(bisecting).Removable);
    }

    [Fact]
    public void AndReportsTheOperationAsTheReason()
    {
        using var fx = new GitFixture();
        var bisecting = fx.AddBranch("bisecting", push: true, mergeToMain: true);
        fx.Git(bisecting, "bisect", "start");

        Assert.Equal("operation in progress", fx.Verdict(bisecting).Reason);
    }

    [Fact]
    public void DetachedWithAUniqueCommitIsNotRemovable()
    {
        using var fx = new GitFixture();
        var detachedUnique = AddDetachedUnique(fx);

        Assert.False(fx.Verdict(detachedUnique).Removable);
    }

    [Fact]
    public void AndNoMergedHeadListCanReleaseItBecauseItHasNoBranch()
    {
        using var fx = new GitFixture();
        var detachedUnique = AddDetachedUnique(fx);

        Assert.False(fx.Verdict(detachedUnique, merged: ["main", "squashed"]).Removable);
    }

    [Fact]
    public void DetachedAtAnAncestorOfTheDefaultBranchIsRemovable()
    {
        using var fx = new GitFixture();
        var detachedMerged = Path.Combine(fx.Base, "detached-merged");
        fx.Git(fx.Repo, "worktree", "add", "--detach", detachedMerged, "origin/main");

        Assert.True(fx.Verdict(detachedMerged).Removable);
    }

    [Fact]
    public void ALinkedWorktreeOnTheDefaultBranchIsNotRemovable()
    {
        using var fx = new GitFixture();
        var onDefault = Path.Combine(fx.Base, "on-default-branch");
        fx.Git(fx.Repo, "worktree", "add", "--force", onDefault, "main");

        Assert.False(fx.Verdict(onDefault).Removable);
    }

    [Fact]
    public void AndReportsWhy()
    {
        using var fx = new GitFixture();
        var onDefault = Path.Combine(fx.Base, "on-default-branch");
        fx.Git(fx.Repo, "worktree", "add", "--force", onDefault, "main");

        Assert.Equal("default branch", fx.Verdict(onDefault).Reason);
    }

    [Fact]
    public void TheMainWorktreeIsNotRemovable()
    {
        using var fx = new GitFixture();

        Assert.False(fx.Verdict(fx.Repo).Removable);
    }

    [Fact]
    public void MainWorktreeReportsWhy()
    {
        using var fx = new GitFixture();

        Assert.Equal("main worktree", fx.Verdict(fx.Repo).Reason);
    }

    [Fact]
    public void ALockedWorktreeIsNotRemovable()
    {
        using var fx = new GitFixture();
        var locked = fx.AddBranch("locked-merged", push: true, mergeToMain: true);
        fx.Git(fx.Repo, "worktree", "lock", locked);

        Assert.False(fx.Verdict(locked).Removable);
    }

    [Fact]
    public void LockedReportsWhy()
    {
        using var fx = new GitFixture();
        var locked = fx.AddBranch("locked-merged", push: true, mergeToMain: true);
        fx.Git(fx.Repo, "worktree", "lock", locked);

        Assert.Equal("locked", fx.Verdict(locked).Reason);
    }

    [Fact]
    public void NoDefaultBranchMeansNotRemovable()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.False(fx.Verdict(merged, @ref: null).Removable);
    }

    [Fact]
    public void NoDefaultBranchReportsWhy()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.Equal("no default branch", fx.Verdict(merged, @ref: null).Reason);
    }

    [Fact]
    public void ADefaultBranchThatDoesNotResolveIsRefusedToo()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        Assert.False(fx.Verdict(merged, @ref: "origin/nope").Removable);
    }

    [Fact]
    public void AStashLeavesTheWorktreeReadingClean()
    {
        using var fx = new GitFixture();
        var stashed = fx.AddBranch("stashed-merged", push: true, mergeToMain: true);
        File.AppendAllText(Path.Combine(stashed, "work.txt"), "work in progress");
        fx.Git(stashed, "stash", "push", "-m", "wip");

        Assert.False(fx.Fact(stashed).Dirty);
    }

    [Fact]
    public void SoTheStashedWorktreeIsRemovableAndTheSkillMustSayTheStashSurvives()
    {
        using var fx = new GitFixture();
        var stashed = fx.AddBranch("stashed-merged", push: true, mergeToMain: true);
        File.AppendAllText(Path.Combine(stashed, "work.txt"), "work in progress");
        fx.Git(stashed, "stash", "push", "-m", "wip");

        Assert.True(fx.Verdict(stashed).Removable);
    }

    [Fact]
    public void APathWithASpaceAndBracketsIsReadCorrectly()
    {
        using var fx = new GitFixture();
        var awkward = fx.AddBranch("awkward/branch", dir: "has space [and] brackets", push: true, mergeToMain: true);

        Assert.True(fx.Verdict(awkward).Removable);
    }

    [Fact]
    public void AMissingDirectoryIsReportedNotCrashedOn()
    {
        using var fx = new GitFixture();
        var vanished = fx.AddBranch("vanished", push: true, mergeToMain: true);
        Directory.Delete(vanished, recursive: true);

        Assert.True(fx.Fact(vanished).Missing);
    }

    [Fact]
    public void AndIsNotRemovable()
    {
        using var fx = new GitFixture();
        var vanished = fx.AddBranch("vanished", push: true, mergeToMain: true);
        Directory.Delete(vanished, recursive: true);

        Assert.False(fx.Verdict(vanished).Removable);
    }

    [Fact]
    public void AStaleGitPointerIsNotRemovable()
    {
        using var fx = new GitFixture();
        var broken = AddBrokenPointer(fx);

        Assert.False(fx.Verdict(broken).Removable);
    }

    [Fact]
    public void AStaleGitPointerReportsAsMissingNotClean()
    {
        using var fx = new GitFixture();
        var broken = AddBrokenPointer(fx);

        Assert.Equal("directory missing", fx.Verdict(broken).Reason);
    }

    [Fact]
    public void DetachedIsRecognised()
    {
        using var fx = new GitFixture();
        var detachedUnique = AddDetachedUnique(fx);

        Assert.True(fx.Fact(detachedUnique).Detached);
    }

    [Fact]
    public void DetachedHasNoBranch()
    {
        using var fx = new GitFixture();
        var detachedUnique = AddDetachedUnique(fx);

        Assert.Null(fx.Fact(detachedUnique).Branch);
    }

    [Fact]
    public void IgnoredFilesAreCountedApartFromDirtyOnes()
    {
        using var fx = new GitFixture();
        var ignored = fx.AddBranch("ignored-merged", push: true, mergeToMain: true);
        Directory.CreateDirectory(Path.Combine(ignored, "ignore-me"));
        File.WriteAllText(Path.Combine(ignored, "ignore-me", "settings.json"), "local settings nobody can regenerate");

        Assert.Equal(0, fx.Fact(ignored).DirtyCount);
    }

    // New coverage: WhatsNext.test.ps1 never exercised this branch of Test-WorktreeRemovable
    // (the current-worktree guard `$here -eq $target`/`StartsWith`) even though it is one of the
    // two catastrophic-in-production cases the predicate's own comments call out. Ported as an
    // explicit parameter (`currentDirectory`) rather than reading process-global state, so it is
    // testable without mutating the test process's own working directory.
    [Fact]
    public void ACurrentWorktreeIsNotRemovable()
    {
        using var fx = new GitFixture();
        var merged = fx.AddBranch("merged-clean", push: true, mergeToMain: true);

        var verdict = fx.Verdict(merged, currentDirectory: merged);

        Assert.False(verdict.Removable);
        Assert.Equal("current worktree", verdict.Reason);
    }

    private static string AddGoneUpstream(GitFixture fx, string branch)
    {
        var path = fx.AddBranch(branch, push: true);
        fx.Git(fx.Remote, "update-ref", "-d", $"refs/heads/{branch}");
        fx.Git(fx.Repo, "fetch", "--prune");
        return path;
    }

    private static string AddSquashed(GitFixture fx)
    {
        fx.AddBranch("squashed", push: true);
        fx.Git(fx.Repo, "merge", "--squash", "squashed");
        fx.Git(fx.Repo, "commit", "-m", "squashed landing");
        fx.Git(fx.Repo, "push", "origin", "main");
        return Path.Combine(fx.Base, "squashed");
    }

    private static string AddDetachedUnique(GitFixture fx)
    {
        var path = Path.Combine(fx.Base, "detached-unique");
        fx.Git(fx.Repo, "worktree", "add", "--detach", path, "main");
        File.WriteAllText(Path.Combine(path, "orphan.txt"), "only copy of this work");
        fx.Git(path, "add", "-A");
        fx.Git(path, "commit", "-m", "commit that lives only here");
        return path;
    }

    private static string AddBrokenPointer(GitFixture fx)
    {
        var path = fx.AddBranch("broken-pointer", push: true, mergeToMain: true);
        File.WriteAllText(Path.Combine(path, ".git"), "gitdir: C:/nowhere/at/all");
        return path;
    }
}
