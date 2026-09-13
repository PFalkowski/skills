namespace WhatsNext;

public interface IReportOpener
{
    void Open(string path);
}

public static class ReportOpening
{
    public static string? Open(IReportOpener opener, string path) => throw new NotImplementedException();
}
