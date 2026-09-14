using Xunit;

namespace WhatsNext.Tests;

// Ports Get-DefaultRef (wip.ps1 at 5fe502c) - no PowerShell test coverage today, so every case
// here is new coverage against a real disposable repository (GitFixture), never a mocked git.
public class DefaultRefTests
{
    [Fact]
    public void PushedBranchName_ResolvesToOriginSlashBranch()
    {
        using var fx = new GitFixture();
        fx.AddBranch("feature", push: true);

        var reference = DefaultRef.Resolve(new ProcessExternalCli(), fx.Repo, "feature");

        Assert.Equal("origin/feature", reference);
    }

    [Fact]
    public void NoBranchNameGiven_FallsBackToOriginHeadSymbolicRef()
    {
        using var fx = new GitFixture();

        var reference = DefaultRef.Resolve(new ProcessExternalCli(), fx.Repo, null);

        Assert.Equal("origin/main", reference);
    }

    [Fact]
    public void BranchNameNeverPushed_FallsBackPastIt()
    {
        using var fx = new GitFixture();
        fx.AddBranch("unpushed-feature");

        var reference = DefaultRef.Resolve(new ProcessExternalCli(), fx.Repo, "unpushed-feature");

        Assert.Equal("origin/main", reference);
    }

    [Fact]
    public void NoRemoteAtAll_ReturnsNull()
    {
        var plain = Directory.CreateTempSubdirectory("wn-defaultref-").FullName;
        var cli = new ProcessExternalCli();
        try
        {
            cli.Run(plain, "git", ["init", "--quiet"]);

            var reference = DefaultRef.Resolve(cli, plain, null);

            Assert.Null(reference);
        }
        finally
        {
            Directory.Delete(plain, recursive: true);
        }
    }
}
