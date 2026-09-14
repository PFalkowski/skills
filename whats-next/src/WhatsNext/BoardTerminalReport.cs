namespace WhatsNext;

public static class BoardTerminalReport
{
    public static void Print(
        TextWriter output, IReadOnlyList<WorkItem> items, IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden, int perRank)
    {
        string? currentRoot = null;
        int currentRank = 0;
        int occurrenceInRank = 0;
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
                occurrenceInRank = 0;
            }

            occurrenceInRank++;
            if (occurrenceInRank > perRank)
            {
                continue;
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

    private static void PrintHiddenCount(
        TextWriter output, IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden, string repoRoot, int rank)
    {
        if (hidden.TryGetValue((repoRoot, rank), out var count))
        {
            output.WriteLine($"        {"",-8}  ... and {count} more {RankLabels.Marks[rank]}");
        }
    }
}
