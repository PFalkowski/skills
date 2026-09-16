using Xunit;

namespace WhatsNext.Tests;

// Ports WhatsNext.test.ps1's "board ranking ladder" and "offline and remoteless repositories
// still produce a board" sections (33 + 1 = 34 checks) one-to-one against a real, disposable git
// repository per test - the ladder's whole job is combining real worktree facts with pull-request
// and live-session facts, so a mocked git layer would certify nothing.
public class BoardAssemblyTests
{
    [Fact]
    public void AWorktreeWithAReadyPullRequestYieldsExactlyOneBoardItemEvenWhenDirty()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("ready-and-dirty", push: true);
        File.AppendAllText(Path.Combine(worktree, "work.txt"), "more work");

        var items = Board(fx, [worktree], [Pr(head: "ready-and-dirty", number: 101)]);

        Assert.Single(items);
    }

    [Fact]
    public void AndThatOneItemIsThePullRequestNotTheDirtyFallthrough()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("ready-and-dirty", push: true);
        File.AppendAllText(Path.Combine(worktree, "work.txt"), "more work");

        var items = Board(fx, [worktree], [Pr(head: "ready-and-dirty", number: 101)]);

        Assert.Equal("pr-ready", items[0].Kind);
    }

    [Fact]
    public void AGreenMergeablePullRequestIsRank1()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("ready-1", push: true);

        var items = Board(fx, [worktree], [Pr(head: "ready-1", number: 102)]);

        Assert.Equal(1, items[0].Rank);
    }

    [Fact]
    public void UnresolvedReviewThreadsIsRank2()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("needs-review", push: true);

        var items = Board(fx, [worktree], [Pr(head: "needs-review", number: 103, unresolved: 2)]);

        Assert.Equal(2, items[0].Rank);
    }

    [Fact]
    public void AndNamesTheUnresolvedThreads()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("needs-review", push: true);

        var items = Board(fx, [worktree], [Pr(head: "needs-review", number: 103, unresolved: 2)]);

        Assert.Contains("unresolved thread", items[0].Label);
    }

    [Fact]
    public void ChangesRequestedIsRank2()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("changes-requested", push: true);

        var items = Board(fx, [worktree], [Pr(head: "changes-requested", number: 104, decision: "CHANGES_REQUESTED")]);

        Assert.Equal(2, items[0].Rank);
    }

    [Fact]
    public void APullRequestWithMergeConflictsNeedsYouSoRank2NotAbsentFromTheBoard()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("conflicted", push: true);

        var items = Board(fx, [worktree], [Pr(head: "conflicted", number: 105, mergeable: "CONFLICTING")]);

        Assert.Equal(2, items[0].Rank);
    }

    [Fact]
    public void AndNamesTheConflict()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("conflicted", push: true);

        var items = Board(fx, [worktree], [Pr(head: "conflicted", number: 105, mergeable: "CONFLICTING")]);

        Assert.Contains("conflict", items[0].Label);
    }

    [Fact]
    public void APullRequestWithFailingChecksNeedsYouSoRank2NotAbsentFromTheBoard()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("checks-failing", push: true);

        var items = Board(fx, [worktree], [Pr(head: "checks-failing", number: 106, rollup: "FAILURE")]);

        Assert.Equal(2, items[0].Rank);
    }

    [Fact]
    public void AndNamesTheFailingChecks()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("checks-failing", push: true);

        var items = Board(fx, [worktree], [Pr(head: "checks-failing", number: 106, rollup: "FAILURE")]);

        Assert.Contains("fail", items[0].Label);
    }

    [Fact]
    public void AnOrphanedConflictedPullRequestNowSurfacesAtRank2()
    {
        using var fx = new GitFixture();

        var items = Board(fx, [], [Pr(head: "orphan-conflicted", number: 109, mergeable: "CONFLICTING")]);

        Assert.Equal(2, items[0].Rank);
    }

    [Fact]
    public void AnOrphanedReadyPullRequestStillSurfacesWithNoWorktree()
    {
        using var fx = new GitFixture();

        var items = Board(fx, [], [Pr(head: "orphan-ready", number: 110)]);

        Assert.Equal("pr-no-worktree", items[0].Kind);
    }

    [Fact]
    public void PushedWithNoOpenPullRequestForgeConsultedIsRank3()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("lonely-branch", push: true);

        var items = Board(fx, [worktree]);

        Assert.Equal(3, items[0].Rank);
    }

    [Fact]
    public void AndSaysSoPlainly()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("lonely-branch", push: true);

        var items = Board(fx, [worktree]);

        Assert.Contains("no pull request", items[0].Label);
    }

    [Fact]
    public void WhenTheForgeWasNeverConsultedTheRowStillAppears()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("unknown-branch", push: true);

        var items = Board(fx, [worktree], noRemote: true);

        Assert.Equal(3, items[0].Rank);
    }

    [Fact]
    public void LabelledAsUnknownNotAsACheckedFact()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("unknown-branch", push: true);

        var items = Board(fx, [worktree], noRemote: true);

        Assert.Contains("unknown", items[0].Label);
    }

    [Fact]
    public void AndDoesNotClaimTheOneFactItNeverChecked()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("unknown-branch", push: true);

        var items = Board(fx, [worktree], noRemote: true);

        Assert.DoesNotContain("no pull request", items[0].Label);
    }

    [Fact]
    public void TheMainWorktreeOnItsOwnDefaultBranchIsNeverARank3Row()
    {
        using var fx = new GitFixture();

        var items = Board(fx, [fx.Repo]);

        Assert.Empty(items);
    }

    [Fact]
    public void AnUnattendedDirtyWorktreeIsRank4()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("dirty-only");
        File.AppendAllText(Path.Combine(worktree, "work.txt"), "edit");

        var items = Board(fx, [worktree]);

        Assert.Equal(4, items[0].Rank);
    }

    [Fact]
    public void LabelledDirtyAtRisk()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("dirty-only");
        File.AppendAllText(Path.Combine(worktree, "work.txt"), "edit");

        var items = Board(fx, [worktree]);

        Assert.Equal("dirty-at-risk", items[0].Kind);
    }

    [Fact]
    public void ACleanBranchWithCommittedButNeverPushedWorkIsOnTheBoard()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("committed-unpushed");

        var items = Board(fx, [worktree]);

        Assert.Equal(4, items[0].Rank);
    }

    [Fact]
    public void LabelledAsNeverPushedNotSilentlyDropped()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("committed-unpushed");

        var items = Board(fx, [worktree]);

        Assert.Contains("never", items[0].Label);
        Assert.Contains("push", items[0].Label);
    }

    [Fact]
    public void NeverPushedSortsAboveDirtyWithinTheSameRank()
    {
        using var fx = new GitFixture();
        var unpushed = fx.AddBranch("unpushed-ordering");
        var dirty = fx.AddBranch("dirty-ordering");
        File.AppendAllText(Path.Combine(dirty, "work.txt"), "edit");

        var items = Board(fx, [dirty, unpushed]);
        var sorted = BoardSorting.Sort(items);

        Assert.Equal("committed-unpushed", sorted[0].Kind);
    }

    [Fact]
    public void ANonLiveWorktreeWithARecentTranscriptStillCarriesThatSessionIdForResume()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("committed-unpushed-with-transcript");

        var items = Board(fx, [worktree], transcriptSessions: [new TranscriptSession(worktree, "transcript-sess-1", DateTimeOffset.UtcNow)]);

        Assert.Equal("transcript-sess-1", items[0].SessionId);
    }

    [Fact]
    public void ABlockedBackgroundSessionIsRank5()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("blocked-session");

        var items = Board(fx, [worktree], liveSessions: [new LiveSession("sess-123", worktree, null, null, "blocked", null)]);

        Assert.Equal(5, items[0].Rank);
    }

    [Fact]
    public void LabelledSessionQuestion()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("blocked-session");

        var items = Board(fx, [worktree], liveSessions: [new LiveSession("sess-123", worktree, null, null, "blocked", null)]);

        Assert.Equal("session-question", items[0].Kind);
    }

    [Fact]
    public void ACheckboxStyleBacklogIsRank6()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("has-backlog-checkbox");
        WriteBacklog(fx, worktree, "# Backlog\n- [ ] first checkbox item\n- [x] done item, not counted\n");

        var items = Board(fx, [worktree]);

        Assert.Equal(6, items[0].Rank);
    }

    [Fact]
    public void AndNamesTheFirstPendingItem()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("has-backlog-checkbox");
        WriteBacklog(fx, worktree, "# Backlog\n- [ ] first checkbox item\n- [x] done item, not counted\n");

        var items = Board(fx, [worktree]);

        Assert.Contains("first checkbox item", items[0].Label);
    }

    [Fact]
    public void TheRealPromptBacklogPendingHeadingFormatIsRank6()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("has-backlog-heading");
        WriteBacklog(fx, worktree, "# Backlog\n\n## [pending] [P1] first heading item\n\nsome context\n");

        var items = Board(fx, [worktree]);

        Assert.Equal(6, items[0].Rank);
    }

    [Fact]
    public void AndNamesTheFirstPendingHeading()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("has-backlog-heading");
        WriteBacklog(fx, worktree, "# Backlog\n\n## [pending] [P1] first heading item\n\nsome context\n");

        var items = Board(fx, [worktree]);

        Assert.Contains("first heading item", items[0].Label);
    }

    [Fact]
    public void ABacklogWithOnlyDoneItemsYieldsNoRank6Item()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("backlog-all-done");
        WriteBacklog(fx, worktree, "## [done] [P1] already finished");

        var items = Board(fx, [worktree]);

        Assert.Empty(items);
    }

    [Fact]
    public void AnOldWorktreeWithNoPullRequestIsStale()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("stale-no-pr");
        fx.SetCommitAge(worktree, 30);

        var items = Board(fx, [worktree], staleDays: 7);

        Assert.Equal(7, items[0].Rank);
    }

    [Fact]
    public void LabelledStale()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("stale-no-pr");
        fx.SetCommitAge(worktree, 30);

        var items = Board(fx, [worktree], staleDays: 7);

        Assert.Equal("stale", items[0].Kind);
    }

    [Fact]
    public void AnOldWorktreeHoldingAnOpenPullRequestIsNotAStaleCleanupCandidate()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("stale-with-pr");
        fx.SetCommitAge(worktree, 30);

        var items = Board(fx, [worktree], [Pr(head: "stale-with-pr", number: 107, decision: "REVIEW_REQUIRED")], staleDays: 7);

        Assert.Empty(items);
    }

    [Fact]
    public void ARepositoryWithNoRemoteDataYieldsNoItemsAndNoError()
    {
        var items = BoardAssembly.ForRepository(
            new ProcessExternalCli(), new SystemClock(), "local-only", @"C:\nowhere", [], null, null, [], [], staleDays: 7);

        Assert.Empty(items);
    }

    private static IReadOnlyList<WorkItem> Board(
        GitFixture fx,
        IReadOnlyList<string> worktrees,
        IReadOnlyList<PullRequestFact>? pullRequests = null,
        IReadOnlyList<LiveSession>? liveSessions = null,
        int staleDays = 7,
        bool noRemote = false,
        IReadOnlyList<TranscriptSession>? transcriptSessions = null,
        IReadOnlyList<TicketFact>? tickets = null) =>
        BoardAssembly.ForRepository(
            new ProcessExternalCli(), new SystemClock(), "r", fx.Repo, worktrees, noRemote ? null : pullRequests ?? [], tickets, liveSessions ?? [],
            transcriptSessions ?? [], staleDays);

    private static PullRequestFact Pr(
        string? head = null,
        int number = 1,
        bool isDraft = false,
        int unresolved = 0,
        string decision = "",
        string? rollup = "SUCCESS",
        string mergeable = "MERGEABLE") =>
        new(number, "synthetic pr", head, "https://example.invalid/pr/1", isDraft, decision, mergeable, rollup, unresolved);

    private static void WriteBacklog(GitFixture fx, string worktree, string content)
    {
        var prompts = Path.Combine(worktree, "prompts");
        Directory.CreateDirectory(prompts);
        File.WriteAllText(Path.Combine(prompts, "backlog.md"), content);
        fx.Git(worktree, "add", "-A");
        fx.Git(worktree, "commit", "-m", "add backlog");
    }
}
