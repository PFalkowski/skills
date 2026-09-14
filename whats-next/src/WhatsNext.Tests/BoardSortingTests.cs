using Xunit;

namespace WhatsNext.Tests;

// Ports WhatsNext.test.ps1's "repository ordering", "deterministic sort" and "repository
// grouping keys on root path, not display name" sections (4 + 1 + 4 = 9 checks) one-to-one,
// pure unit tests over hand-built WorkItem lists - Sort-BoardItem needs no I/O. Also carries
// Select-Shown's own cases (the terminal text's -PerRank collapsing, review finding R8), since
// it needs no I/O either and sits beside the sort.
public class BoardSortingTests
{
    [Fact]
    public void TheHottestRepositoryComesFirst()
    {
        var ordered = BoardSorting.Sort(FourItemBoard());

        Assert.Equal("beta", ordered[0].Repo);
    }

    [Fact]
    public void ItsOwnItemsStayTogether()
    {
        var ordered = BoardSorting.Sort(FourItemBoard());

        Assert.Equal("beta", ordered[1].Repo);
    }

    [Fact]
    public void TheCoolerRepositoryFollowsWhole()
    {
        var ordered = BoardSorting.Sort(FourItemBoard());

        Assert.Equal("alpha", ordered[2].Repo);
    }

    [Fact]
    public void AndIsInternallyRanked()
    {
        var ordered = BoardSorting.Sort(FourItemBoard());

        Assert.Equal(4, ordered[2].Rank);
    }

    [Fact]
    public void TheSameFactSetSortsIdenticallyRegardlessOfTheOrderItArrivedIn()
    {
        var dup = new[]
        {
            Row("gamma", "gamma", 4, path: @"C:\gamma\z"),
            Row("gamma", "gamma", 4, path: @"C:\gamma\a"),
            Row("gamma", "gamma", 4, path: @"C:\gamma\m"),
        };

        var forward = BoardSorting.Sort(dup).Select(item => item.Path);
        var reversed = BoardSorting.Sort([dup[2], dup[1], dup[0]]).Select(item => item.Path);

        Assert.Equal(forward, reversed);
    }

    [Fact]
    public void TheGenuinelyHotRepositoryLeads()
    {
        var ordered = BoardSorting.Sort(GroupingBoard());

        Assert.Equal(@"C:\repos\one", ordered[0].RepoRoot);
    }

    [Fact]
    public void AMerelyWarmRepositoryIsNotOvertakenByASameNamedReposUnrelatedHeat()
    {
        var ordered = BoardSorting.Sort(GroupingBoard());

        Assert.Equal(@"C:\repos\mid", ordered[1].RepoRoot);
    }

    [Fact]
    public void TheSameNamedButCoolerRepositoryTrailsOnItsOwnMerit()
    {
        var ordered = BoardSorting.Sort(GroupingBoard());

        Assert.Equal(@"C:\repos\two", ordered[2].RepoRoot);
    }

    [Fact]
    public void TwoSameNamedRepositoriesDoNotInterleaveTheirItems()
    {
        var items = new[]
        {
            Row("dup", @"C:\repos\one", 1, path: @"C:\repos\one\a"),
            Row("dup", @"C:\repos\two", 1, path: @"C:\repos\two\a"),
            Row("dup", @"C:\repos\one", 4, path: @"C:\repos\one\b"),
        };

        var ordered = BoardSorting.Sort(items);

        Assert.Equal(@"C:\repos\one", ordered[1].RepoRoot);
    }

    [Fact]
    public void SelectShownWithinPerRankAllShownNoneHidden()
    {
        var items = new[] { Row("r", "root", 1), Row("r", "root", 1), Row("r", "root", 1) };

        var (shown, hidden) = BoardSorting.SelectShown(items, perRank: 3);

        Assert.Equal(3, shown.Count);
        Assert.Empty(hidden);
    }

    [Fact]
    public void SelectShownOverPerRankHidesTheRestAndCountsThem()
    {
        var items = new[] { Row("r", "root", 1), Row("r", "root", 1), Row("r", "root", 1) };

        var (shown, hidden) = BoardSorting.SelectShown(items, perRank: 2);

        Assert.Equal(2, shown.Count);
        Assert.Equal(1, hidden[("root", 1)]);
    }

    [Fact]
    public void SelectShownCountsAreKeptSeparatelyPerRepositoryAndRank()
    {
        var items = new[]
        {
            Row("r", "root", 1), Row("r", "root", 1), Row("r", "root", 1),
            Row("r", "root", 2), Row("r", "root", 2), Row("r", "root", 2),
        };

        var (shown, hidden) = BoardSorting.SelectShown(items, perRank: 1);

        Assert.Equal(2, shown.Count);
        Assert.Equal(2, hidden[("root", 1)]);
        Assert.Equal(2, hidden[("root", 2)]);
    }

    private static WorkItem[] FourItemBoard() =>
    [
        Row("beta", "root-beta", 1),
        Row("alpha", "root-alpha", 4),
        Row("alpha", "root-alpha", 6),
        Row("beta", "root-beta", 7),
    ];

    private static WorkItem[] GroupingBoard() =>
    [
        Row("dup", @"C:\repos\one", 1),
        Row("dup", @"C:\repos\two", 6),
        Row("mid", @"C:\repos\mid", 3),
    ];

    private static WorkItem Row(string repo, string repoRoot, int rank, string kind = "x", string? path = null) =>
        new(repo, repoRoot, rank, kind, "", path ?? $"{repo}-{rank}-{kind}", null, null, null, false);
}
