using System.Text.Json;
using System.Text.RegularExpressions;

namespace WhatsNext;

public static partial class GitHubPullRequestFetch
{
    // One round trip per repository. `gh pr list` cannot report unresolved review threads at
    // all, and a per-pull-request follow-up would multiply the only network cost this board has.
    // The merged heads come back in the same call because prune cannot recognise a squash merge
    // without them.
    private const string Query = """
        query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
        defaultBranchRef{name}
        open:pullRequests(states:OPEN,first:100){nodes{
        number title isDraft headRefName reviewDecision mergeable url
        reviewThreads(first:100){nodes{isResolved}}
        commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}
        merged:pullRequests(states:MERGED,first:100,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{headRefName headRefOid}}}}
        """;

    public static RepositoryPullRequests? Fetch(IExternalCli cli, string workingDirectory, string? remoteUrl)
    {
        var slug = ParseGitHubSlug(remoteUrl);
        if (slug is null)
        {
            return null;
        }

        var result = cli.Run(
            workingDirectory,
            "gh",
            ["api", "graphql", "-f", $"owner={slug.Value.Owner}", "-f", $"name={slug.Value.Name}", "-f", $"query={Query}"]);
        if (result.ExitCode != 0)
        {
            return null;
        }

        return Parse(string.Join('\n', result.StdOutLines));
    }

    private static RepositoryPullRequests? Parse(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }

        using (document)
        {
            if (!document.RootElement.TryGetProperty("data", out var data) ||
                !data.TryGetProperty("repository", out var repository) ||
                repository.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            return new RepositoryPullRequests(
                ParseDefaultBranch(repository),
                ParseMergedHeads(repository),
                ParseOpenPullRequests(repository));
        }
    }

    private static string? ParseDefaultBranch(JsonElement repository) =>
        repository.TryGetProperty("defaultBranchRef", out var defaultBranchRef) &&
        defaultBranchRef.ValueKind == JsonValueKind.Object
            ? defaultBranchRef.GetProperty("name").GetString()
            : null;

    private static IReadOnlyList<MergedPullRequestHead> ParseMergedHeads(JsonElement repository)
    {
        if (!repository.TryGetProperty("merged", out var merged) || !merged.TryGetProperty("nodes", out var nodes))
        {
            return [];
        }

        return [.. nodes.EnumerateArray().Select(node => new MergedPullRequestHead(
            node.GetProperty("headRefName").GetString() ?? string.Empty,
            node.GetProperty("headRefOid").GetString() ?? string.Empty))];
    }

    private static IReadOnlyList<PullRequestFact> ParseOpenPullRequests(JsonElement repository)
    {
        if (!repository.TryGetProperty("open", out var open) || !open.TryGetProperty("nodes", out var nodes))
        {
            return [];
        }

        return [.. nodes.EnumerateArray().Select(ParsePullRequest)];
    }

    private static PullRequestFact ParsePullRequest(JsonElement node)
    {
        var rollupElement = node.GetProperty("commits").GetProperty("nodes")[0]
            .GetProperty("commit").GetProperty("statusCheckRollup");
        var rollup = rollupElement.ValueKind == JsonValueKind.Null ? null : rollupElement.GetProperty("state").GetString();
        var unresolvedThreadCount = node.GetProperty("reviewThreads").GetProperty("nodes")
            .EnumerateArray()
            .Count(thread => !thread.GetProperty("isResolved").GetBoolean());

        return new PullRequestFact(
            Number: node.GetProperty("number").GetInt32(),
            Title: node.GetProperty("title").GetString() ?? string.Empty,
            Head: node.GetProperty("headRefName").GetString(),
            Url: node.GetProperty("url").GetString() ?? string.Empty,
            IsDraft: node.GetProperty("isDraft").GetBoolean(),
            Decision: node.GetProperty("reviewDecision").GetString() ?? string.Empty,
            Mergeable: node.GetProperty("mergeable").GetString() ?? string.Empty,
            Rollup: rollup,
            UnresolvedThreadCount: unresolvedThreadCount);
    }

    private static (string Owner, string Name)? ParseGitHubSlug(string? remoteUrl)
    {
        if (string.IsNullOrEmpty(remoteUrl))
        {
            return null;
        }

        var match = GitHubSlugPattern().Match(remoteUrl);
        return match.Success ? (match.Groups[1].Value, match.Groups[2].Value) : null;
    }

    [GeneratedRegex(@"(?i)github\.com[:/]([^/:]+)/([^/]+?)(\.git)?/?$")]
    private static partial Regex GitHubSlugPattern();
}
