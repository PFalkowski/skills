using Xunit;

namespace WhatsNext.Tests;

// Get-RepositoryGroup has no PowerShell test coverage today - new coverage this port adds,
// against real disposable git repositories (GitFixture) - grouping's whole job is reading real
// git's own common-dir/remote output, so a mocked git layer would certify nothing.
public class RepositoryGroupingTests
{
    [Fact]
    public void WorktreesOfOneRepositoryGroupUnderItsCommonRoot()
    {
        using var fx = new GitFixture();
        var worktree = fx.AddBranch("feature");

        var groups = RepositoryGrouping.From(new ProcessExternalCli(), [fx.Repo, worktree]);

        var group = Assert.Single(groups);
        Assert.Equal(fx.Repo, group.Root);
        Assert.Contains(fx.Repo, group.Worktrees);
        Assert.Contains(worktree, group.Worktrees);
    }

    [Fact]
    public void ADirectoryThatIsNotAGitRepositoryContributesNoGroup()
    {
        var plain = Directory.CreateTempSubdirectory("wn-not-a-repo-").FullName;
        try
        {
            var groups = RepositoryGrouping.From(new ProcessExternalCli(), [plain]);

            Assert.Empty(groups);
        }
        finally
        {
            Directory.Delete(plain, recursive: true);
        }
    }

    [Fact]
    public void ANonGithubRemoteGetsNoSlugButStillGroups()
    {
        using var fx = new GitFixture();

        var groups = RepositoryGrouping.From(new ProcessExternalCli(), [fx.Repo]);

        var group = Assert.Single(groups);
        Assert.Null(group.Slug);
    }

    [Fact]
    public void AGithubRemoteYieldsItsOwnerSlashNameSlug()
    {
        using var fx = new GitFixture();
        fx.Git(fx.Repo, "remote", "set-url", "origin", "https://github.com/acme/widgets.git");

        var groups = RepositoryGrouping.From(new ProcessExternalCli(), [fx.Repo]);

        var group = Assert.Single(groups);
        Assert.Equal("acme/widgets", group.Slug);
        Assert.Equal("acme/widgets", group.Name);
        Assert.Equal("https://github.com/acme/widgets.git", group.OriginUrl);
    }
}
