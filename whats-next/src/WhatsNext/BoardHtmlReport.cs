using System.Globalization;
using System.Net;
using System.Text;

namespace WhatsNext;

public static class BoardHtmlReport
{
    public static string Render(
        IReadOnlyList<WorkItem> items,
        IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden,
        DateOnly date,
        string fullCommandPrefix)
    {
        var repoOrder = new List<string>();
        var byRepo = new Dictionary<string, List<(int Number, WorkItem Item)>>();
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (!byRepo.TryGetValue(item.RepoRoot, out var rows))
            {
                rows = [];
                byRepo[item.RepoRoot] = rows;
                repoOrder.Add(item.RepoRoot);
            }
            rows.Add((i + 1, item));
        }

        var body = new StringBuilder();
        foreach (var root in repoOrder)
        {
            AppendSection(body, root, byRepo[root], hidden, fullCommandPrefix);
        }

        var repoOptions = new StringBuilder();
        foreach (var root in repoOrder)
        {
            var name = Encode(byRepo[root][0].Item.Repo);
            repoOptions.Append("<option value=\"").Append(name).Append("\">").Append(name).Append("</option>");
        }

        return LoadTemplate()
            .Replace("{{REPO_COUNT}}", repoOrder.Count.ToString(CultureInfo.InvariantCulture))
            .Replace("{{ITEM_COUNT}}", items.Count.ToString(CultureInfo.InvariantCulture))
            .Replace("{{DATE}}", date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
            .Replace("{{REPO_OPTIONS}}", repoOptions.ToString())
            .Replace("{{BODY}}", body.ToString());
    }

    private static void AppendSection(
        StringBuilder body,
        string root,
        List<(int Number, WorkItem Item)> rows,
        IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden,
        string fullCommandPrefix)
    {
        var repoName = Encode(rows[0].Item.Repo);
        body.Append("<section class=\"repo\" data-repo=\"").Append(repoName).Append("\">");
        body.Append("<div class=\"repo-head\"><span class=\"repo-name\">").Append(repoName).Append("</span></div>");

        int? currentRank = null;
        foreach (var (number, item) in rows)
        {
            if (currentRank is { } previousRank && previousRank != item.Rank)
            {
                AppendMoreRow(body, hidden, root, previousRank);
            }
            currentRank = item.Rank;
            AppendRow(body, number, item, fullCommandPrefix);
        }
        if (currentRank is { } lastRank)
        {
            AppendMoreRow(body, hidden, root, lastRank);
        }
        body.Append("</section>");
    }

    private static void AppendMoreRow(
        StringBuilder body, IReadOnlyDictionary<(string RepoRoot, int Rank), int> hidden, string root, int rank)
    {
        if (hidden.TryGetValue((root, rank), out var count))
        {
            body.Append("<div class=\"more-row\">+").Append(count).Append(" more ").Append(RankLabels.Marks[rank]).Append("</div>");
        }
    }

    private static void AppendRow(StringBuilder body, int number, WorkItem item, string fullCommandPrefix)
    {
        var slug = RankLabels.Slugs[item.Rank];
        var where = item.Branch ?? Path.GetFileName(item.Path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        var labelHtml = Encode(item.Label);
        var whereHtml = Encode(where);
        var openTag = item.AlreadyOpen ? "<span class=\"here\">SESSION OPEN</span>" : "";
        var fullCommandHtml = Encode($"{fullCommandPrefix} {number}");

        body.Append("<div class=\"row\" data-tier=\"").Append(slug).Append("\">")
            .Append("<div class=\"rank tabular\">").Append(number).Append("</div>")
            .Append("<div class=\"pill pill-").Append(slug).Append("\">").Append(RankLabels.Marks[item.Rank]).Append("</div>")
            .Append("<div>")
            .Append("<div class=\"row-title\">").Append(labelHtml).Append(openTag).Append("</div>")
            .Append("<div class=\"row-meta\">").Append(whereHtml).Append("</div>")
            .Append("<div class=\"cmd-group\">")
            .Append("<button class=\"jump-btn resume-btn\" data-n=\"").Append(number).Append("\" data-cmd=\"wip ").Append(number).Append("\">")
            .Append("<svg class=\"play-icon\" viewBox=\"0 0 10 10\" aria-hidden=\"true\"><path d=\"M1 0l8 5-8 5z\"/></svg>")
            .Append("<span>wip ").Append(number).Append("</span></button>")
            .Append("<button class=\"jump-btn full-btn\" data-n=\"").Append(number).Append("\">").Append(fullCommandHtml).Append("</button>")
            .Append("</div></div></div>");
    }

    private static string Encode(string text) => WebUtility.HtmlEncode(text);

    private static string LoadTemplate()
    {
        var assembly = typeof(BoardHtmlReport).Assembly;
        using var stream = assembly.GetManifestResourceStream("WhatsNext.board-template.html")
            ?? throw new InvalidOperationException("Embedded resource 'WhatsNext.board-template.html' was not found.");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
