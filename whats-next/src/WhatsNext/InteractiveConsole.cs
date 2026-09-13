namespace WhatsNext;

public static class InteractiveConsole
{
    public static bool IsInteractive(bool inputRedirected, bool outputRedirected, bool userInteractive, string? ci) =>
        string.IsNullOrEmpty(ci) && userInteractive && !inputRedirected && !outputRedirected;

    public static bool IsInteractive() =>
        IsInteractive(
            Console.IsInputRedirected,
            Console.IsOutputRedirected,
            Environment.UserInteractive,
            Environment.GetEnvironmentVariable("CI"));
}
