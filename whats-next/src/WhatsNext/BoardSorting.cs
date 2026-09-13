namespace WhatsNext;

public static class BoardSorting
{
    public static IReadOnlyList<WorkItem> Sort(IReadOnlyList<WorkItem> items) => throw new NotImplementedException();

    public static (IReadOnlyList<WorkItem> Shown, IReadOnlyDictionary<(string RepoRoot, int Rank), int> Hidden) SelectShown(
        IReadOnlyList<WorkItem> items, int perRank) => throw new NotImplementedException();
}
