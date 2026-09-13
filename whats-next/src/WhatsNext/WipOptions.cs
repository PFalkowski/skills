namespace WhatsNext;

public sealed record WipOptions(int SinceDays, int StaleDays, int PerRank, bool Html, bool Apply, bool IncludeIgnored, bool Fetch);
