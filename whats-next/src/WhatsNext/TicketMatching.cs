using System.Text.RegularExpressions;

namespace WhatsNext;

public sealed record MatchSignal(string Id, IReadOnlyList<string> References);

public sealed record TicketGroup(IReadOnlySet<string> SignalIds, IReadOnlySet<string> References);

public static partial class TicketMatching
{
    [GeneratedRegex(@"(?<![A-Za-z0-9])[A-Z][A-Z0-9]{0,9}-[0-9]+(?![A-Za-z0-9])")]
    private static partial Regex ProjectKeyPattern();

    [GeneratedRegex(@"(?<![A-Za-z0-9])#([0-9]+)")]
    private static partial Regex IssueHashPattern();

    [GeneratedRegex(@"https://github\.com/[^/\s]+/[^/\s]+/(?:issues|pull)/([0-9]+)")]
    private static partial Regex IssueUrlPattern();

    [GeneratedRegex(@"(?<![A-Za-z0-9])(?:issue|gh)-([0-9]+)(?![A-Za-z0-9])", RegexOptions.IgnoreCase)]
    private static partial Regex BranchIssuePattern();

    public static IReadOnlyList<string> FindProjectKeys(string text, IReadOnlySet<string> configuredPrefixes)
    {
        var keys = new List<string>();
        foreach (Match match in ProjectKeyPattern().Matches(text))
        {
            var key = match.Value;
            var prefix = key[..key.IndexOf('-')];
            if (configuredPrefixes.Contains(prefix))
            {
                keys.Add(key);
            }
        }
        return keys;
    }

    public static IReadOnlyList<int> FindGitHubIssueNumbers(string text)
    {
        var numbers = new SortedSet<int>();
        foreach (Match match in IssueHashPattern().Matches(text))
        {
            numbers.Add(int.Parse(match.Groups[1].Value));
        }
        foreach (Match match in IssueUrlPattern().Matches(text))
        {
            numbers.Add(int.Parse(match.Groups[1].Value));
        }
        return numbers.ToList();
    }

    public static int? FindGitHubIssueNumberInBranch(string branchName)
    {
        var match = BranchIssuePattern().Match(branchName);
        return match.Success ? int.Parse(match.Groups[1].Value) : null;
    }

    public static IReadOnlyList<TicketGroup> Group(IReadOnlyList<MatchSignal> signals)
    {
        var parent = new Dictionary<string, string>();

        string Find(string node)
        {
            parent.TryAdd(node, node);
            while (parent[node] != node)
            {
                parent[node] = parent[parent[node]];
                node = parent[node];
            }
            return node;
        }

        void Union(string a, string b)
        {
            var rootA = Find(a);
            var rootB = Find(b);
            if (rootA != rootB)
            {
                parent[rootA] = rootB;
            }
        }

        foreach (var signal in signals)
        {
            Find(signal.Id);
            foreach (var reference in signal.References)
            {
                Union(signal.Id, reference);
            }
        }

        var groups = new Dictionary<string, (HashSet<string> Ids, HashSet<string> References)>();
        foreach (var signal in signals)
        {
            var root = Find(signal.Id);
            if (!groups.TryGetValue(root, out var group))
            {
                group = ([], []);
                groups[root] = group;
            }
            group.Ids.Add(signal.Id);
            foreach (var reference in signal.References)
            {
                group.References.Add(reference);
            }
        }

        return groups.Values.Select(g => new TicketGroup(g.Ids, g.References)).ToList();
    }
}
