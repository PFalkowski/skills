namespace WhatsNext;

public static class RankLabels
{
    public static readonly IReadOnlyDictionary<int, string> Marks = new Dictionary<int, string>
    {
        [1] = "MERGE",
        [2] = "REVIEW",
        [3] = "NO PR",
        [4] = "AT RISK",
        [5] = "ASKED",
        [6] = "BACKLOG",
        [7] = "STALE",
    };

    public static readonly IReadOnlyDictionary<int, string> Slugs = new Dictionary<int, string>
    {
        [1] = "merge",
        [2] = "review",
        [3] = "nopr",
        [4] = "atrisk",
        [5] = "asked",
        [6] = "backlog",
        [7] = "stale",
    };
}
