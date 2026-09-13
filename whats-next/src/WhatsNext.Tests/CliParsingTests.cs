using System.Diagnostics;
using Xunit;

namespace WhatsNext.Tests;

public class CliParsingTests
{
    [Theory]
    [InlineData("-h")]
    [InlineData("--help")]
    public void Help_PrintsUsageAndExitsZero(string helpFlag)
    {
        var result = RunCli(helpFlag);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("Usage", result.StdOut);
    }

    // Ports Test-Interactive (wip.ps1 at 5fe502c): CI set, a redirected stream, or a
    // non-interactive session all mean "not interactive".
    [Theory]
    [InlineData(true, false, true, null, false)]
    [InlineData(false, true, true, null, false)]
    [InlineData(false, false, true, "true", false)]
    [InlineData(false, false, false, null, false)]
    [InlineData(false, false, true, null, true)]
    public void IsInteractive_ReflectsConsoleAndEnvironmentState(
        bool inputRedirected, bool outputRedirected, bool userInteractive, string? ci, bool expected)
    {
        Assert.Equal(expected, InteractiveConsole.IsInteractive(inputRedirected, outputRedirected, userInteractive, ci));
    }

    // Ports the closing if/elseif/else chain of wip.ps1 at 5fe502c.
    [Theory]
    [InlineData(null, RouteKind.ShowBoard, 0)]
    [InlineData("", RouteKind.ShowBoard, 0)]
    [InlineData("prune", RouteKind.Prune, 0)]
    [InlineData("5", RouteKind.StartItem, 5)]
    [InlineData("007", RouteKind.StartItem, 7)]
    [InlineData("banana", RouteKind.Invalid, 0)]
    [InlineData("-3", RouteKind.Invalid, 0)]
    public void Classify_RoutesToTheRightHandler(string? item, RouteKind expectedKind, int expectedNumber)
    {
        var route = CliRouting.Classify(item);

        Assert.Equal(expectedKind, route.Kind);
        Assert.Equal(expectedNumber, route.Number);
    }

    [Fact]
    public void InvalidItem_PrintsUsageAndExitsNonZero()
    {
        var result = RunCli("banana");

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Usage", result.StdErr);
    }

    [Fact]
    public void RootCommand_DefaultOptionValues_MatchTheDocumentedDefaults()
    {
        var parseResult = CliOptionsDefinition.BuildRootCommand().Parse([]);
        var options = CliOptionsDefinition.ReadOptions(parseResult);

        Assert.Null(parseResult.GetValue(CliOptionsDefinition.ItemArgument));
        Assert.Equal(14, options.SinceDays);
        Assert.Equal(7, options.StaleDays);
        Assert.Equal(5, options.PerRank);
        Assert.False(options.Html);
        Assert.False(options.Apply);
        Assert.False(options.IncludeIgnored);
        Assert.False(options.Fetch);
    }

    [Fact]
    public void RootCommand_ItemNumberAndHtml_ParseAsPositionalAndOption()
    {
        var parseResult = CliOptionsDefinition.BuildRootCommand().Parse(["42", "-Html"]);

        Assert.Equal("42", parseResult.GetValue(CliOptionsDefinition.ItemArgument));
        Assert.True(CliOptionsDefinition.ReadOptions(parseResult).Html);
    }

    [Fact]
    public void RootCommand_PruneWithEveryFlag_ParsesEachOptionValue()
    {
        var parseResult = CliOptionsDefinition.BuildRootCommand().Parse(["prune", "-Apply", "-Fetch", "-IncludeIgnored"]);
        var options = CliOptionsDefinition.ReadOptions(parseResult);

        Assert.Equal("prune", parseResult.GetValue(CliOptionsDefinition.ItemArgument));
        Assert.True(options.Apply);
        Assert.True(options.Fetch);
        Assert.True(options.IncludeIgnored);
    }

    [Fact]
    public void RootCommand_SinceDaysStaleDaysPerRank_OverrideTheirDefaults()
    {
        var parseResult = CliOptionsDefinition.BuildRootCommand().Parse(["-SinceDays", "30", "-StaleDays", "10", "-PerRank", "2"]);
        var options = CliOptionsDefinition.ReadOptions(parseResult);

        Assert.Equal(30, options.SinceDays);
        Assert.Equal(10, options.StaleDays);
        Assert.Equal(2, options.PerRank);
    }

    private static (int ExitCode, string StdOut, string StdErr) RunCli(params string[] args)
    {
        var dllPath = Path.Combine(AppContext.BaseDirectory, "WhatsNext.dll");
        var startInfo = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add(dllPath);
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = Process.Start(startInfo)!;
        var stdOut = process.StandardOutput.ReadToEnd();
        var stdErr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        return (process.ExitCode, stdOut, stdErr);
    }
}
