using Xunit;

namespace WhatsNext.Tests;

public class PullRequestRankTests
{
    [Fact]
    public void GreenAndMergeableIsRank1() =>
        Assert.Equal(1, PullRequestRank.Rank(Pr()));

    [Fact]
    public void AnUnresolvedThreadOutranksGreen() =>
        Assert.Equal(2, PullRequestRank.Rank(Pr(unresolved: 1)));

    [Fact]
    public void ChangesRequestedIsRank2() =>
        Assert.Equal(2, PullRequestRank.Rank(Pr(decision: "CHANGES_REQUESTED")));

    [Fact]
    public void AnUnresolvedThreadBeatsAnEmptyDecision() =>
        Assert.Equal(2, PullRequestRank.Rank(Pr(unresolved: 3, decision: "")));

    [Fact]
    public void ADraftIsNotOnTheBoard() =>
        Assert.Null(PullRequestRank.Rank(Pr(isDraft: true)));

    [Fact]
    public void AFailingCheckNeedsYouSoRank2NotReadyToMerge() =>
        Assert.Equal(2, PullRequestRank.Rank(Pr(rollup: "FAILURE")));

    [Fact]
    public void APendingCheckIsNotReadyToMerge() =>
        Assert.Null(PullRequestRank.Rank(Pr(rollup: "PENDING")));

    [Fact]
    public void NoChecksConfiguredIsNotAFailure() =>
        Assert.Equal(1, PullRequestRank.Rank(Pr(rollup: null)));

    [Fact]
    public void AConflictedBranchNeedsYouSoRank2NotAbsentFromTheBoard() =>
        Assert.Equal(2, PullRequestRank.Rank(Pr(mergeable: "CONFLICTING")));

    [Fact]
    public void ARequiredReviewStillOutstandingIsNotReady() =>
        Assert.Null(PullRequestRank.Rank(Pr(decision: "REVIEW_REQUIRED")));

    private static PullRequestFact Pr(
        bool isDraft = false,
        int unresolved = 0,
        string decision = "",
        string? rollup = "SUCCESS",
        string mergeable = "MERGEABLE") =>
        new(
            Number: 1,
            Title: "synthetic pr",
            Head: null,
            Url: "https://example.invalid/pr/1",
            IsDraft: isDraft,
            Decision: decision,
            Mergeable: mergeable,
            Rollup: rollup,
            UnresolvedThreadCount: unresolved);
}
