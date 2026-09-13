using System.Text.RegularExpressions;

namespace WhatsNext;

public static partial class BacklogItems
{
    public static IReadOnlyList<string> Read(string worktreePath)
    {
        var file = Path.Combine(worktreePath, "prompts", "backlog.md");
        if (!File.Exists(file))
        {
            return [];
        }

        var items = new List<string>();
        foreach (var line in File.ReadLines(file))
        {
            var match = ItemPattern().Match(line);
            if (match.Success)
            {
                items.Add(match.Groups["item"].Value.Trim());
            }
        }
        return items;
    }

    [GeneratedRegex(@"^\s*[-*]\s*\[\s\]\s*(?<item>.+)$|^##\s*\[pending\]\s*(?<item>.+)$")]
    private static partial Regex ItemPattern();
}
