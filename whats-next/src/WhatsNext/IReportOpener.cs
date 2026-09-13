namespace WhatsNext;

public interface IReportOpener
{
    void Open(string path);
}

public static class ReportOpening
{
    public static string? Open(IReportOpener opener, string path)
    {
        try
        {
            opener.Open(path);
            return null;
        }
        catch (Exception ex)
        {
            return $"Could not open a browser automatically ({ex.Message}). The report is at: {path}";
        }
    }
}
