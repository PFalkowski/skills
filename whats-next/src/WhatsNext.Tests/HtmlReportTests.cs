using Xunit;

namespace WhatsNext.Tests;

// Ports New-BoardHtml (wip.ps1 at 5fe502c) - the PowerShell suite never tested it directly, so
// every case here is new coverage, not a port of an existing check.
public class HtmlReportTests
{
    [Fact]
    public void EachRepositoryGetsItsOwnSectionInFirstSeenOrder()
    {
        var html = Render(
            Row("beta", "root-beta", 1),
            Row("alpha", "root-alpha", 1));

        Assert.True(
            html.IndexOf("data-repo=\"beta\"", StringComparison.Ordinal) <
            html.IndexOf("data-repo=\"alpha\"", StringComparison.Ordinal));
    }

    [Fact]
    public void ARowCarriesItsRankTierAndPillLabel()
    {
        var html = Render(Row("solo", "root-solo", 2));

        Assert.Contains("data-tier=\"review\"", html, StringComparison.Ordinal);
        Assert.Contains("pill-review", html, StringComparison.Ordinal);
        Assert.Contains(">REVIEW<", html, StringComparison.Ordinal);
    }

    [Fact]
    public void ASessionAlreadyOpenGetsTheOpenTag()
    {
        var html = Render(Row("solo", "root-solo", 1, alreadyOpen: true));

        Assert.Contains("SESSION OPEN", html, StringComparison.Ordinal);
    }

    [Fact]
    public void ASessionNotOpenHasNoOpenTag()
    {
        var html = Render(Row("solo", "root-solo", 1, alreadyOpen: false));

        Assert.DoesNotContain("SESSION OPEN", html, StringComparison.Ordinal);
    }

    [Fact]
    public void ARowsButtonsCarryTheResumeCommandAndTheFullCommand()
    {
        var html = Render(Row("solo", "root-solo", 1));

        Assert.Contains("data-n=\"1\" data-cmd=\"wip 1\"", html, StringComparison.Ordinal);
        Assert.Contains("<span>wip 1</span>", html, StringComparison.Ordinal);
        Assert.Contains("full-btn", html, StringComparison.Ordinal);
        Assert.Contains("launch-wip 1", html, StringComparison.Ordinal);
    }

    [Fact]
    public void CollapsedRowsShowTheHiddenCountForTheirOwnRepositoryAndRank()
    {
        var items = new[] { Row("solo", "root-solo", 1), Row("solo", "root-solo", 1), Row("solo", "root-solo", 1) };
        var (shown, hidden) = BoardSorting.SelectShown(items, perRank: 1);

        var html = BoardHtmlReport.Render(shown, hidden, new DateOnly(2026, 9, 13), "launch-wip");

        Assert.Contains("+2 more MERGE", html, StringComparison.Ordinal);
    }

    [Fact]
    public void AHostileLabelArrivesHtmlEncodedNeverAsLiveMarkup()
    {
        var html = Render(Row("solo", "root-solo", 1, label: "<script>alert(1)</script>"));

        Assert.DoesNotContain("<script>alert(1)</script>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html, StringComparison.Ordinal);
    }

    [Fact]
    public void AQuoteInABranchNameArrivesEncoded()
    {
        var html = Render(Row("solo", "root-solo", 1, branch: "feature/say-\"hi\""));

        Assert.Contains("feature/say-&quot;hi&quot;", html, StringComparison.Ordinal);
        Assert.DoesNotContain("feature/say-\"hi\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void EveryPlaceholderIsSubstituted()
    {
        var html = Render(Row("solo", "root-solo", 1));

        Assert.DoesNotContain("{{", html, StringComparison.Ordinal);
        Assert.Contains("<b class=\"tabular\">1</b> repositories", html, StringComparison.Ordinal);
        Assert.Contains("<b class=\"tabular\">1</b> items shown", html, StringComparison.Ordinal);
        Assert.Contains("generated <b>2026-09-13</b>", html, StringComparison.Ordinal);
        Assert.Contains("<option value=\"solo\">solo</option>", html, StringComparison.Ordinal);
    }

    private static string Render(params WorkItem[] items) =>
        BoardHtmlReport.Render(items, new Dictionary<(string, int), int>(), new DateOnly(2026, 9, 13), "launch-wip");

    private static WorkItem Row(
        string repo, string repoRoot, int rank, string? branch = null, string label = "label", bool alreadyOpen = false) =>
        new(repo, repoRoot, rank, "x", label, $"{repo}-path", branch, null, null, alreadyOpen);
}
