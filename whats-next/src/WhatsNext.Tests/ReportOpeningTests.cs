using Xunit;

namespace WhatsNext.Tests;

// Ports Open-Report (wip.ps1 at 5fe502c). The per-OS branch itself (Start-Process/open/xdg-open)
// is inherently interactive and is verified by manual check instead - this exercises only the
// fallback-message behaviour, through the fake, never a real browser.
public class ReportOpeningTests
{
    [Fact]
    public void ASuccessfulOpenReturnsNoMessageAndReachesTheOpener()
    {
        var opener = new FakeReportOpener();

        var message = ReportOpening.Open(opener, @"C:\state\board.html");

        Assert.Null(message);
        Assert.Equal(@"C:\state\board.html", opener.LastOpenedPath);
    }

    [Fact]
    public void AFailingOpenerYieldsTheFallbackMessageNamingThePath()
    {
        var opener = new FakeReportOpener(new InvalidOperationException("no handler registered"));

        var message = ReportOpening.Open(opener, @"C:\state\board.html");

        Assert.Equal(
            @"Could not open a browser automatically (no handler registered). The report is at: C:\state\board.html",
            message);
    }
}
