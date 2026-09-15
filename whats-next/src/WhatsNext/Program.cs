using System.Text.Json;
using WhatsNext;

var root = CliOptionsDefinition.BuildRootCommand();
root.SetAction(parseResult =>
{
    var item = parseResult.GetValue(CliOptionsDefinition.ItemArgument);
    var options = CliOptionsDefinition.ReadOptions(parseResult);

    try
    {
        var route = CliRouting.Classify(item);
        return route.Kind switch
        {
            RouteKind.ShowBoard => RunBoard(options),
            RouteKind.StartItem => RunItem(route.Number),
            RouteKind.Prune => RunPrune(options),
            _ => Invalid(),
        };
    }
    catch (InvalidOperationException ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }
});

return root.Parse(args).Invoke();

static int Invalid()
{
    Console.Error.WriteLine("Usage: wip [-Html] | wip <n> | wip prune [-Apply] [-IncludeIgnored] [-Fetch] | wip -h");
    return 1;
}

static int RunItem(int number)
{
    var boardFilePath = Path.Combine(WhatsNextStateRoot(), "board.json");
    var runner = new StartItemRunner(new SessionLauncher(new ProcessExternalCli()), Console.Out);
    return runner.Run(boardFilePath, number);
}

static int RunBoard(WipOptions options)
{
    var cli = new ProcessExternalCli();
    var clock = new SystemClock();
    var stateRoot = WhatsNextStateRoot();
    var (repos, liveSessions, transcriptSessions) = RepositoryDiscovery.Discover(cli, clock, TranscriptProjectsRoot(), options.SinceDays);
    var items = Board.Build(cli, clock, repos, [], liveSessions, transcriptSessions, options.StaleDays);

    if (items.Count == 0)
    {
        Console.WriteLine("Nothing to pick up. No recent activity, open pull requests, or worktrees needing attention.");
        return 0;
    }

    var (_, hidden) = BoardSorting.SelectShown(items, options.PerRank);
    Directory.CreateDirectory(stateRoot);

    var launcherPath = Environment.GetEnvironmentVariable("WIP_LAUNCHER");
    WriteBoardFiles(cli, clock, stateRoot, items, hidden, options.PerRank, launcherPath);

    if (options.Html)
    {
        return 0;
    }

    BoardTerminalReport.Print(Console.Out, items, hidden, options.PerRank);
    Console.WriteLine();
    Console.WriteLine("  wip <n> to go there.  wip prune to clear dead worktrees.");

    RunProtocolFirstRun(cli, stateRoot, launcherPath);
    return 0;
}

static void WriteBoardFiles(
    IExternalCli cli,
    IClock clock,
    string stateRoot,
    IReadOnlyList<WorkItem> items,
    IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden,
    int perRank,
    string? launcherPath)
{
    var boardError = AtomicWrite.WriteAllText(Path.Combine(stateRoot, "board.json"), JsonSerializer.Serialize(items));
    if (boardError is not null)
    {
        Console.Error.WriteLine(boardError);
    }

    var htmlFilePath = Path.Combine(stateRoot, "board.html");
    var html = BoardHtmlReport.Render(items, hidden, perRank, DateOnly.FromDateTime(clock.UtcNow.LocalDateTime), launcherPath ?? "wip");
    var htmlError = AtomicWrite.WriteAllText(htmlFilePath, html);
    if (htmlError is not null)
    {
        Console.Error.WriteLine(htmlError);
        return;
    }

    var openError = ReportOpening.Open(cli, htmlFilePath);
    if (openError is not null)
    {
        Console.WriteLine(openError);
    }
}

static void RunProtocolFirstRun(IExternalCli cli, string stateRoot, string? launcherPath)
{
    var markerPath = Path.Combine(stateRoot, "protocol-prompted");
    var interactive = InteractiveConsole.IsInteractive(
        Console.IsInputRedirected, Console.IsOutputRedirected, Environment.UserInteractive,
        Environment.GetEnvironmentVariable("CI"));
    var registerScriptPath = launcherPath is not null
        ? Path.Combine(Path.GetDirectoryName(launcherPath)!, "register-protocol.ps1")
        : null;
    ProtocolFirstRun.Run(cli, markerPath, interactive, Console.In, Console.Out, registerScriptPath);
}

static int RunPrune(WipOptions options)
{
    var cli = new ProcessExternalCli();
    var clock = new SystemClock();
    var (repos, liveSessions, _) = RepositoryDiscovery.Discover(cli, clock, TranscriptProjectsRoot(), options.SinceDays);
    PrunePipeline.Run(
        cli, clock, Console.Out, repos, liveSessions, Environment.CurrentDirectory, options.Apply, options.IncludeIgnored, options.Fetch);
    return 0;
}

static string WhatsNextStateRoot()
{
    var agentsStateRoot = Environment.GetEnvironmentVariable("AGENTS_STATE");
    var stateRoot = string.IsNullOrEmpty(agentsStateRoot)
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".agent-state")
        : agentsStateRoot;
    return Path.Combine(stateRoot, "whats-next");
}

static string TranscriptProjectsRoot() =>
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "projects");
