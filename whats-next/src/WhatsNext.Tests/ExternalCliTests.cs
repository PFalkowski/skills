using Xunit;

namespace WhatsNext.Tests;

public class ExternalCliTests
{
    [Fact]
    public void Run_ArgumentContainingSpaceAndQuote_ArrivesAsOneArgument()
    {
        var cli = new ProcessExternalCli();
        var tempRoot = Directory.CreateTempSubdirectory("wip-externalcli-").FullName;
        var targetDir = Path.Combine(tempRoot, "repo with space and 'quote");

        var result = cli.Run(tempRoot, "git", ["init", targetDir]);

        Assert.Equal(0, result.ExitCode);
        Assert.True(Directory.Exists(Path.Combine(targetDir, ".git")));
    }
}
