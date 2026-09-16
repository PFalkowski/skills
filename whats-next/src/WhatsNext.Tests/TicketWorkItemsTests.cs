using Xunit;

namespace WhatsNext.Tests;

public class TicketWorkItemsTests
{
    [Fact]
    public void ThreeTicketsWithNoMatchingBranchYieldExactlyThreeTicketTodoRows()
    {
        var tickets = new[]
        {
            new TicketFact(10, "Fix the thing", "https://github.com/owner/repo/issues/10", "OPEN"),
            new TicketFact(11, "Add the other thing", "https://github.com/owner/repo/issues/11", "OPEN"),
            new TicketFact(12, "Investigate flake", "https://github.com/owner/repo/issues/12", "OPEN"),
        };

        var items = TicketWorkItems.ForRepository("r", @"C:\repo", tickets, worktreesByBranch: new Dictionary<string, (string Path, string? SessionId)>());

        Assert.Equal(3, items.Count);
        Assert.All(items, item => Assert.Equal("ticket-todo", item.Kind));
    }

    [Fact]
    public void AnUnmatchedTicketRowCarriesNoBranchOrSession()
    {
        var tickets = new[] { new TicketFact(10, "Fix the thing", "https://github.com/owner/repo/issues/10", "OPEN") };

        var items = TicketWorkItems.ForRepository("r", @"C:\repo", tickets, worktreesByBranch: new Dictionary<string, (string Path, string? SessionId)>());

        var item = Assert.Single(items);
        Assert.Null(item.Branch);
        Assert.Null(item.SessionId);
    }

    [Fact]
    public void ATicketWhoseBranchCarriesAMatchedKeyLinksTheRowsBranchAndSession()
    {
        var tickets = new[] { new TicketFact(10, "Fix the thing", "https://github.com/owner/repo/issues/10", "OPEN") };
        var worktreesByBranch = new Dictionary<string, (string Path, string? SessionId)>
        {
            ["issue-10"] = (@"C:\repo-worktrees\issue-10", "sess-1"),
        };

        var items = TicketWorkItems.ForRepository("r", @"C:\repo", tickets, worktreesByBranch);

        var item = Assert.Single(items);
        Assert.Equal("issue-10", item.Branch);
        Assert.Equal("sess-1", item.SessionId);
        Assert.Equal(@"C:\repo-worktrees\issue-10", item.Path);
    }

    [Fact]
    public void ABranchReferencingADifferentTicketDoesNotLinkThisOne()
    {
        var tickets = new[] { new TicketFact(10, "Fix the thing", "https://github.com/owner/repo/issues/10", "OPEN") };
        var worktreesByBranch = new Dictionary<string, (string Path, string? SessionId)>
        {
            ["issue-99"] = (@"C:\repo-worktrees\issue-99", "sess-2"),
        };

        var items = TicketWorkItems.ForRepository("r", @"C:\repo", tickets, worktreesByBranch);

        var item = Assert.Single(items);
        Assert.Null(item.Branch);
    }

    [Fact]
    public void NoTicketsYieldsNoRows()
    {
        var items = TicketWorkItems.ForRepository("r", @"C:\repo", tickets: null, worktreesByBranch: new Dictionary<string, (string Path, string? SessionId)>());

        Assert.Empty(items);
    }
}
