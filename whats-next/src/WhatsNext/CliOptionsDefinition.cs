using System.CommandLine;

namespace WhatsNext;

// The declarative param() block of wip.ps1 at 5fe502c, as a testable System.CommandLine
// definition: building the RootCommand and reading a ParseResult back into WipOptions are kept
// separate from any handler, so a test can assert routing and option values without invoking one.
public static class CliOptionsDefinition
{
    public static Argument<string?> ItemArgument { get; } = new("item") { Arity = ArgumentArity.ZeroOrOne };

    public static Option<bool> ApplyOption { get; } = new("-Apply");

    public static Option<bool> IncludeIgnoredOption { get; } = new("-IncludeIgnored");

    public static Option<bool> FetchOption { get; } = new("-Fetch");

    public static Option<bool> HtmlOption { get; } = new("-Html");

    public static Option<int> SinceDaysOption { get; } = new("-SinceDays") { DefaultValueFactory = _ => 14 };

    public static Option<int> StaleDaysOption { get; } = new("-StaleDays") { DefaultValueFactory = _ => 7 };

    public static Option<int> PerRankOption { get; } = new("-PerRank") { DefaultValueFactory = _ => 5 };

    public static RootCommand BuildRootCommand()
    {
        var root = new RootCommand("wip - what's next board");
        root.Arguments.Add(ItemArgument);
        root.Options.Add(ApplyOption);
        root.Options.Add(IncludeIgnoredOption);
        root.Options.Add(FetchOption);
        root.Options.Add(HtmlOption);
        root.Options.Add(SinceDaysOption);
        root.Options.Add(StaleDaysOption);
        root.Options.Add(PerRankOption);
        return root;
    }

    public static WipOptions ReadOptions(ParseResult parseResult) => new(
        parseResult.GetValue(SinceDaysOption),
        parseResult.GetValue(StaleDaysOption),
        parseResult.GetValue(PerRankOption),
        parseResult.GetValue(HtmlOption),
        parseResult.GetValue(ApplyOption),
        parseResult.GetValue(IncludeIgnoredOption),
        parseResult.GetValue(FetchOption));
}
