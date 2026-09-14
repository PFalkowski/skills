namespace WhatsNext;

// Plan §6, corrected by review R1's local experiment: File.Move(tmp, final, overwrite: true)
// throws UnauthorizedAccessException while any process still has the destination open, on every
// FileShare mode tried, so a bounded retry is load-bearing, not defensive polish. Review R2: a
// fixed 200ms bound was sized to that one experiment, not to real Windows file-lock durations
// (antivirus, a search indexer, backup software), so the retries back off exponentially instead
// of at a fixed interval, up to about a second total before giving up.
public static class AtomicWrite
{
    private static readonly TimeSpan MaxRetryDuration = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan InitialRetryDelay = TimeSpan.FromMilliseconds(25);

    public static string? WriteAllText(string path, string contents)
    {
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, contents);

        Exception? lastFailure = null;
        var elapsed = TimeSpan.Zero;
        var delay = InitialRetryDelay;
        while (true)
        {
            try
            {
                File.Move(tempPath, path, overwrite: true);
                return null;
            }
            catch (UnauthorizedAccessException ex)
            {
                lastFailure = ex;
                if (elapsed + delay >= MaxRetryDuration)
                {
                    break;
                }
                Thread.Sleep(delay);
                elapsed += delay;
                delay += delay;
            }
        }

        return $"could not save `{path}`: another process has it open ({lastFailure!.Message})";
    }
}
