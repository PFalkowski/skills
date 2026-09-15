namespace WhatsNext;

// Ticket rows are not tied to one worktree, same shape as BoardAssembly.ForRepository's
// unclaimed pr-no-worktree rows. Per this sub-slice's backlog default, they get their own
// unranked kind rather than a new numeric rung in the 1-7 urgency ladder - S2 owns real
// prioritisation; rank 7 (the ladder's lowest urgency) is the placeholder until then.
public static class TicketWorkItems
{
    private const int Rank = 7;
    private const string BranchSignalPrefix = "branch:";
    private const string TicketSignalPrefix = "ticket:";

    public static IReadOnlyList<WorkItem> ForRepository(
        string repoName,
        string repoRoot,
        IReadOnlyList<TicketFact>? tickets,
        IReadOnlyDictionary<string, (string Path, string? SessionId)> worktreesByBranch)
    {
        if (tickets is null || tickets.Count == 0)
        {
            return [];
        }

        var matchedBranchByTicketNumber = MatchBranches(tickets, worktreesByBranch.Keys);

        return [.. tickets.Select(ticket =>
        {
            var matchedBranch = matchedBranchByTicketNumber.GetValueOrDefault(ticket.Number);
            var worktree = matchedBranch is not null ? worktreesByBranch[matchedBranch] : ((string Path, string? SessionId)?)null;
            return new WorkItem(
                repoName, repoRoot, Rank, "ticket-todo", $"#{ticket.Number} {ticket.Title}",
                worktree?.Path ?? repoRoot, matchedBranch, worktree?.SessionId, ticket.Url, AlreadyOpen: false);
        })];
    }

    private static Dictionary<int, string> MatchBranches(IReadOnlyList<TicketFact> tickets, IEnumerable<string> branches)
    {
        var signals = new List<MatchSignal>();
        foreach (var ticket in tickets)
        {
            signals.Add(new MatchSignal($"{TicketSignalPrefix}{ticket.Number}", [$"GH:{ticket.Number}"]));
        }
        foreach (var branch in branches)
        {
            var references = TicketMatching.FindGitHubIssueNumberInBranch(branch) is { } number ? new[] { $"GH:{number}" } : [];
            signals.Add(new MatchSignal($"{BranchSignalPrefix}{branch}", references));
        }

        var matchedBranchByTicketNumber = new Dictionary<int, string>();
        foreach (var group in TicketMatching.Group(signals))
        {
            var branchSignalId = group.SignalIds.FirstOrDefault(id => id.StartsWith(BranchSignalPrefix, StringComparison.Ordinal));
            if (branchSignalId is null)
            {
                continue;
            }

            var branch = branchSignalId[BranchSignalPrefix.Length..];
            foreach (var ticketSignalId in group.SignalIds.Where(id => id.StartsWith(TicketSignalPrefix, StringComparison.Ordinal)))
            {
                matchedBranchByTicketNumber[int.Parse(ticketSignalId[TicketSignalPrefix.Length..])] = branch;
            }
        }

        return matchedBranchByTicketNumber;
    }
}
