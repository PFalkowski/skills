using System.CommandLine;
using WhatsNext;

var itemArgument = new Argument<int?>("item") { Arity = ArgumentArity.ZeroOrOne };

var root = new RootCommand("wip - what's next board");
root.Arguments.Add(itemArgument);
root.SetAction(parseResult =>
{
    var item = parseResult.GetValue(itemArgument);
    if (item is null)
    {
        return 0;
    }

    var boardFilePath = Path.Combine(WhatsNextStateRoot(), "board.json");
    var runner = new StartItemRunner(new SessionLauncher(new ProcessExternalCli()), Console.Out);
    try
    {
        return runner.Run(boardFilePath, item.Value);
    }
    catch (InvalidOperationException ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }
});

return root.Parse(args).Invoke();

static string WhatsNextStateRoot()
{
    var agentsStateRoot = Environment.GetEnvironmentVariable("AGENTS_STATE");
    var stateRoot = string.IsNullOrEmpty(agentsStateRoot)
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".agent-state")
        : agentsStateRoot;
    return Path.Combine(stateRoot, "whats-next");
}
