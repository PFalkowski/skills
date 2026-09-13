namespace WhatsNext;

// Plan §6, corrected by review R1's local experiment: File.Move(tmp, final, overwrite: true)
// throws UnauthorizedAccessException while any process still has the destination open, on every
// FileShare mode tried, so a bounded retry is load-bearing, not defensive polish.
public static class AtomicWrite
{
    private const int MaxAttempts = 5;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(40);

    public static string? WriteAllText(string path, string contents)
    {
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, contents);

        Exception? lastFailure = null;
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                File.Move(tempPath, path, overwrite: true);
                return null;
            }
            catch (UnauthorizedAccessException ex)
            {
                lastFailure = ex;
                if (attempt < MaxAttempts)
                {
                    Thread.Sleep(RetryDelay);
                }
            }
        }

        return $"could not save `{path}`: another process has it open ({lastFailure!.Message})";
    }
}
