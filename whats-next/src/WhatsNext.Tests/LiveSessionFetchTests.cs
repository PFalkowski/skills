using Xunit;

namespace WhatsNext.Tests;

// The `claude agents --json` thin layer plan §2 named but never assigned a class or test count
// to - new coverage the PowerShell suite never had, exercised with a FakeExternalCli returning
// canned JSON, declared unreachable to the real `claude` binary.
public class LiveSessionFetchTests
{
    private const string CannedResponse = """
        [{"sessionId":"sess-1","cwd":"/repo/worktree","kind":"background","name":"fix bug","state":"blocked","status":"waiting"}]
        """;

    [Fact]
    public void Fetch_CannedResponse_ParsesEveryField()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        var sessions = LiveSessionFetch.Fetch(cli, "/repo");

        var session = Assert.Single(sessions);
        Assert.Equal("sess-1", session.SessionId);
        Assert.Equal("/repo/worktree", session.Cwd);
        Assert.Equal("background", session.Kind);
        Assert.Equal("fix bug", session.Name);
        Assert.Equal("blocked", session.State);
        Assert.Equal("waiting", session.Status);
    }

    [Fact]
    public void Fetch_UsesTheDocumentedCommand()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, [CannedResponse], []));

        LiveSessionFetch.Fetch(cli, "/repo");

        Assert.Equal("claude", cli.LastRun!.Value.FileName);
        Assert.Equal(["agents", "--json"], cli.LastRun.Value.Args);
    }

    [Fact]
    public void Fetch_NonZeroExitCode_YieldsNoLiveSessionsNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(1, [], ["error: not logged in"]));

        var sessions = LiveSessionFetch.Fetch(cli, "/repo");

        Assert.Empty(sessions);
    }

    [Fact]
    public void Fetch_UnparseableOutput_YieldsNoLiveSessionsNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["not json at all"], []));

        var sessions = LiveSessionFetch.Fetch(cli, "/repo");

        Assert.Empty(sessions);
    }

    [Fact]
    public void Fetch_JsonObjectInsteadOfArray_YieldsNoLiveSessionsNeverACrash()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["""{"unexpected":"shape"}"""], []));

        var sessions = LiveSessionFetch.Fetch(cli, "/repo");

        Assert.Empty(sessions);
    }

    [Fact]
    public void Fetch_EntryMissingFields_LeavesThemNullRatherThanThrowing()
    {
        var cli = new FakeExternalCli(new ExternalCliResult(0, ["""[{"sessionId":"sess-2"}]"""], []));

        var sessions = LiveSessionFetch.Fetch(cli, "/repo");

        var session = Assert.Single(sessions);
        Assert.Equal("sess-2", session.SessionId);
        Assert.Null(session.Cwd);
        Assert.Null(session.State);
    }
}
