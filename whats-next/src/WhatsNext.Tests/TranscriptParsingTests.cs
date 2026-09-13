using Xunit;

namespace WhatsNext.Tests;

// Ports WhatsNext.test.ps1's "transcript fallback degrades" section (5 checks) one-to-one -
// Read-TranscriptHint's whole job is degrading gracefully on a line it cannot use, so each check
// is a shape of input the parser must survive.
public class TranscriptParsingTests
{
    [Fact]
    public void AnUnparseableLineYieldsNothingRatherThanAnError()
    {
        Assert.Null(TranscriptReader.ReadHint("not json at all"));
    }

    [Fact]
    public void JsonWithoutTheExpectedFieldsYieldsNothing()
    {
        Assert.Null(TranscriptReader.ReadHint("""{"unexpected":"shape"}"""));
    }

    [Fact]
    public void AJsonArrayYieldsNothing()
    {
        Assert.Null(TranscriptReader.ReadHint("[1,2,3]"));
    }

    [Fact]
    public void AnEmptyLineYieldsNothing()
    {
        Assert.Null(TranscriptReader.ReadHint(""));
    }

    [Fact]
    public void ARecognisedLineStillYieldsTheWorkingDirectory()
    {
        var hint = TranscriptReader.ReadHint("""{"cwd":"C:\\x","sessionId":"abc"}""");

        Assert.Equal(@"C:\x", hint!.Cwd);
    }
}
