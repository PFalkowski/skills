namespace WhatsNext;

public static class BoardHtmlReport
{
    public static string Render(
        IReadOnlyList<WorkItem> items,
        IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden,
        DateOnly date,
        string fullCommandPrefix) => throw new NotImplementedException();
}
