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
    var items = Board.Build(cli, clock, repos, liveSessions, transcriptSessions, options.StaleDays);

    if (items.Count == 0)
    {
        Console.WriteLine("Nothing to pick up. No recent activity, open pull requests, or worktrees needing attention.");
        return 0;
    }

    var (shown, hidden) = BoardSorting.SelectShown(items, options.PerRank);
    Directory.CreateDirectory(stateRoot);

    var launcherPath = Environment.GetEnvironmentVariable("WIP_LAUNCHER");
    WriteBoardFiles(cli, clock, stateRoot, shown, hidden, launcherPath);

    if (options.Html)
    {
        return 0;
    }

    PrintTerminalBoard(Console.Out, shown, hidden);
    Console.WriteLine();
    Console.WriteLine("  wip <n> to go there.  wip prune to clear dead worktrees.");

    RunProtocolFirstRun(cli, stateRoot, launcherPath);
    return 0;
}

static void WriteBoardFiles(
    IExternalCli cli,
    IClock clock,
    string stateRoot,
    IReadOnlyList<WorkItem> shown,
    IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden,
    string? launcherPath)
{
    var boardError = AtomicWrite.WriteAllText(Path.Combine(stateRoot, "board.json"), JsonSerializer.Serialize(shown));
    if (boardError is not null)
    {
        Console.Error.WriteLine(boardError);
    }

    var htmlFilePath = Path.Combine(stateRoot, "board.html");
    var html = BoardHtmlReport.Render(shown, hidden, DateOnly.FromDateTime(clock.UtcNow.LocalDateTime), launcherPath ?? "wip");
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

static void PrintTerminalBoard(
    TextWriter output, IReadOnlyList<WorkItem> items, IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden)
{
    string? currentRoot = null;
    int currentRank = 0;
    for (var i = 0; i < items.Count; i++)
    {
        var entry = items[i];
        if (entry.RepoRoot != currentRoot || entry.Rank != currentRank)
        {
            if (currentRoot is not null)
            {
                PrintHiddenCount(output, hidden, currentRoot, currentRank);
            }
            if (entry.RepoRoot != currentRoot)
            {
                output.WriteLine();
                output.WriteLine($"  {entry.Repo}");
            }
            currentRoot = entry.RepoRoot;
            currentRank = entry.Rank;
        }

        var where = entry.Branch ?? Path.GetFileName(entry.Path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (entry.AlreadyOpen)
        {
            where += "   [a session is already open here]";
        }
        output.WriteLine($"{i + 1,4}  {RankLabels.Marks[entry.Rank],-8}  {entry.Label}");
        output.WriteLine($"        {"",-8}  {where}");
    }
    if (currentRoot is not null)
    {
        PrintHiddenCount(output, hidden, currentRoot, currentRank);
    }
}

static void PrintHiddenCount(
    TextWriter output, IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden, string repoRoot, int rank)
{
    if (hidden.TryGetValue((repoRoot, rank), out var count))
    {
        output.WriteLine($"        {"",-8}  ... and {count} more {RankLabels.Marks[rank]}");
    }
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
