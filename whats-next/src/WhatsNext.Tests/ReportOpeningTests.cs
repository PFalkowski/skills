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
        var cli = new FakeExternalCli();

        var message = ReportOpening.Open(cli, @"C:\state\board.html");

        Assert.Null(message);
        Assert.Equal(@"C:\state\board.html", cli.LastOpenedPath);
    }

    [Fact]
    public void AFailingOpenerYieldsTheFallbackMessageNamingThePath()
    {
        var cli = new FakeExternalCli(throwOnOpen: new InvalidOperationException("no handler registered"));

        var message = ReportOpening.Open(cli, @"C:\state\board.html");

        Assert.Equal(
            @"Could not open a browser automatically (no handler registered). The report is at: C:\state\board.html",
            message);
    }
}
