namespace WhatsNext;

public static class ReportOpening
{
    public static string? Open(IExternalCli cli, string path)
    {
        try
        {
            cli.OpenWithDefaultApplication(path);
            return null;
        }
        catch (Exception ex)
        {
            return $"Could not open a browser automatically ({ex.Message}). The report is at: {path}";
        }
    }
}
