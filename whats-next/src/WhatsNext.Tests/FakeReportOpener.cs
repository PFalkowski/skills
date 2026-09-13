namespace WhatsNext.Tests;

internal sealed class FakeReportOpener(Exception? throwOnOpen = null) : IReportOpener
{
    public string? LastOpenedPath { get; private set; }

    public void Open(string path)
    {
        LastOpenedPath = path;
        if (throwOnOpen is not null)
        {
            throw throwOnOpen;
        }
    }
}
