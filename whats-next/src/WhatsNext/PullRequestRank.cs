namespace WhatsNext;

public static class PullRequestRank
{
    public static int? Rank(PullRequestFact pullRequest)
    {
        if (pullRequest.IsDraft)
        {
            return null;
        }
        if (pullRequest.UnresolvedThreadCount > 0 ||
            pullRequest.Decision == "CHANGES_REQUESTED" ||
            pullRequest.Rollup == "FAILURE" ||
            pullRequest.Mergeable == "CONFLICTING")
        {
            return 2;
        }
        if (pullRequest.Decision == "REVIEW_REQUIRED")
        {
            return null;
        }
        if (pullRequest.Rollup is not (null or "SUCCESS"))
        {
            return null;
        }
        if (pullRequest.Mergeable != "MERGEABLE")
        {
            return null;
        }
        return 1;
    }
}
