using System.Diagnostics;

namespace WhatsNext;

// The path passed here always comes from BoardHtmlReport's own write under the state root, never
// from repository content, which is what makes Windows' UseShellExecute safe: it resolves the
// file's default handler through the shell, but there is no argument text an attacker controls
// for that shell to misparse.
public sealed class ProcessReportOpener : IReportOpener
{
    public void Open(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            return;
        }

        var opener = OperatingSystem.IsMacOS() ? "open" : "xdg-open";
        var startInfo = new ProcessStartInfo(opener) { UseShellExecute = false };
        startInfo.ArgumentList.Add(path);
        Process.Start(startInfo);
    }
}
