using Xunit;

namespace WhatsNext.Tests;

public class BoardTerminalReportTests
{
    [Fact]
    public void ARowAfterAHiddenGroupCarriesItsFullListPositionNotARenumberingOfPrintedRowsOnly()
    {
        var items = new[]
        {
            Row("r", "root", 1), Row("r", "root", 1), Row("r", "root", 1),
            Row("r", "root", 2),
        };
        var (_, hidden) = BoardSorting.SelectShown(items, perRank: 1);
        var output = new StringWriter();

        BoardTerminalReport.Print(output, items, hidden, perRank: 1);

        Assert.Contains("   4  REVIEW", output.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("   2  REVIEW", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void OnlyPerRankIndividualRowsPrintPerGroupBeforeTheMoreSummary()
    {
        var items = new[] { Row("r", "root", 1), Row("r", "root", 1), Row("r", "root", 1) };
        var (_, hidden) = BoardSorting.SelectShown(items, perRank: 1);
        var output = new StringWriter();

        BoardTerminalReport.Print(output, items, hidden, perRank: 1);
        var printed = output.ToString();

        Assert.Equal(1, CountOccurrences(printed, "MERGE     label"));
        Assert.Contains("... and 2 more MERGE", printed, StringComparison.Ordinal);
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        var index = 0;
        while ((index = haystack.IndexOf(needle, index, StringComparison.Ordinal)) != -1)
        {
            count++;
            index += needle.Length;
        }
        return count;
    }

    private static WorkItem Row(string repo, string repoRoot, int rank) =>
        new(repo, repoRoot, rank, "x", "label", $"{repo}-path", null, null, null, false);
}
