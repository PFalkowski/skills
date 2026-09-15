namespace WhatsNext.Tests;

// For the end-to-end snapshot test: git commands run for real, against GitFixture's real,
// temporary repositories. gh and claude - the two commands that would otherwise reach a live
// network call or a real Claude Code installation - answer from fixtures fixed at construction
// time instead, so the test never touches either.
internal sealed class FixtureBackedExternalCli(string gitHubGraphQlResponse, string claudeAgentsJson) : IExternalCli
{
    private readonly IExternalCli _git = new ProcessExternalCli();

    public ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args)
    {
        if (fileName == "git")
        {
            return _git.Run(workingDirectory, fileName, args);
        }
        if (fileName == "gh" && args.Contains("-f"))
        {
            return new ExternalCliResult(0, [gitHubGraphQlResponse], []);
        }
        if (fileName == "claude" && args.Contains("agents") && args.Contains("--json"))
        {
            return new ExternalCliResult(0, [claudeAgentsJson], []);
        }

        throw new InvalidOperationException($"FixtureBackedExternalCli has no fixture for '{fileName} {string.Join(' ', args)}'.");
    }

    public int RunAttached(string workingDirectory, string fileName, IReadOnlyList<string> args) =>
        throw new NotSupportedException("The end-to-end snapshot test never launches an attached process.");

    public void OpenWithDefaultApplication(string path) =>
        throw new NotSupportedException("The end-to-end snapshot test never opens a report.");
}
