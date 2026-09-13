namespace WhatsNext;

public static class BoardSorting
{
    public static IReadOnlyList<WorkItem> Sort(IReadOnlyList<WorkItem> items)
    {
        var hottestRankByRoot = new Dictionary<string, int>();
        foreach (var item in items)
        {
            if (!hottestRankByRoot.TryGetValue(item.RepoRoot, out var hottest) || item.Rank < hottest)
            {
                hottestRankByRoot[item.RepoRoot] = item.Rank;
            }
        }

        return [.. items
            .OrderBy(item => hottestRankByRoot[item.RepoRoot])
            .ThenBy(item => item.RepoRoot, StringComparer.Ordinal)
            .ThenBy(item => item.Rank)
            .ThenBy(item => item.Kind, StringComparer.Ordinal)
            .ThenBy(item => item.Path, StringComparer.Ordinal)];
    }

    public static (IReadOnlyList<WorkItem> Shown, IReadOnlyDictionary<(string RepoRoot, int Rank), int> Hidden) SelectShown(
        IReadOnlyList<WorkItem> items, int perRank)
    {
        var shown = new List<WorkItem>();
        var hidden = new Dictionary<(string RepoRoot, int Rank), int>();
        var countByKey = new Dictionary<(string RepoRoot, int Rank), int>();

        foreach (var item in items)
        {
            var key = (item.RepoRoot, item.Rank);
            var count = countByKey[key] = countByKey.GetValueOrDefault(key) + 1;
            if (count <= perRank)
            {
                shown.Add(item);
            }
            else
            {
                hidden[key] = hidden.GetValueOrDefault(key) + 1;
            }
        }

        return (shown, hidden);
    }
}
