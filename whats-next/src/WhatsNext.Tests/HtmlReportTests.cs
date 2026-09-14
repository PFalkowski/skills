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
        var html = RenderThreeInOneGroup();

        Assert.Contains(">+2 more MERGE<", html, StringComparison.Ordinal);
    }

    [Fact]
    public void OnlyPerRankRowsRenderOutsideTheHiddenContainer()
    {
        var html = RenderThreeInOneGroup();

        var containerStart = html.IndexOf("class=\"hidden-rows\"", StringComparison.Ordinal);

        Assert.True(containerStart > 0);
        Assert.Equal(1, CountOccurrences(html[..containerStart], "class=\"row\""));
        Assert.Equal(3, CountOccurrences(html, "class=\"row\""));
    }

    [Fact]
    public void EveryExtraRowIsPresentInsideTheHiddenContainerWithItsFullListNumberAndAResumeButton()
    {
        var html = RenderThreeInOneGroup();

        var containerStart = html.IndexOf("<div class=\"hidden-rows\"", StringComparison.Ordinal);
        var containerTag = html[containerStart..html.IndexOf('>', containerStart)];
        var hiddenSection = html[containerStart..];

        Assert.Contains("hidden", containerTag, StringComparison.Ordinal);
        Assert.Contains("data-n=\"2\" data-cmd=\"wip 2\"", hiddenSection, StringComparison.Ordinal);
        Assert.Contains("data-n=\"3\" data-cmd=\"wip 3\"", hiddenSection, StringComparison.Ordinal);
    }

    [Fact]
    public void TheToggleButtonIsPairedWithTheContainerItControls()
    {
        var html = RenderThreeInOneGroup();

        var toggleStart = html.IndexOf("class=\"more-row more-toggle\"", StringComparison.Ordinal);
        var toggleTag = html[toggleStart..html.IndexOf('>', toggleStart)];
        var target = ExtractAttribute(toggleTag, "data-target");

        Assert.Contains($"id=\"{target}\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void AHostileLabelInAnExtraRowStillArrivesHtmlEncoded()
    {
        var items = new[] { Row("solo", "root-solo", 1), Row("solo", "root-solo", 1, label: "<script>alert(1)</script>") };
        var (_, hidden) = BoardSorting.SelectShown(items, perRank: 1);

        var html = BoardHtmlReport.Render(items, hidden, perRank: 1, new DateOnly(2026, 9, 13), "launch-wip");

        Assert.DoesNotContain("<script>alert(1)</script>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html, StringComparison.Ordinal);
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
        BoardHtmlReport.Render(items, new Dictionary<(string, int), int>(), perRank: 5, new DateOnly(2026, 9, 13), "launch-wip");

    private static string RenderThreeInOneGroup()
    {
        var items = new[] { Row("solo", "root-solo", 1), Row("solo", "root-solo", 1), Row("solo", "root-solo", 1) };
        var (_, hidden) = BoardSorting.SelectShown(items, perRank: 1);
        return BoardHtmlReport.Render(items, hidden, perRank: 1, new DateOnly(2026, 9, 13), "launch-wip");
    }

    private static WorkItem Row(
        string repo, string repoRoot, int rank, string? branch = null, string label = "label", bool alreadyOpen = false) =>
        new(repo, repoRoot, rank, "x", label, $"{repo}-path", branch, null, null, alreadyOpen);

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

    private static string ExtractAttribute(string tag, string name)
    {
        var marker = $"{name}=\"";
        var start = tag.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
        return tag[start..tag.IndexOf('"', start)];
    }
}
