using Xunit;

namespace WhatsNext.Tests;

public class WorktreeFactReaderTests
{
    [Fact]
    public void LastCommitAgeIsMeasuredFromTheInjectedClockNotTheRealClock()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddGoneUpstreamBranch("clock-seam");
        fx.SetCommitAge(worktree, 5);
        var farFuture = new FakeClock(DateTimeOffset.UtcNow.AddDays(365));

        var fact = fx.Fact(worktree, farFuture);

        Assert.True(fact.LastCommitAge > TimeSpan.FromDays(360));
    }
}
