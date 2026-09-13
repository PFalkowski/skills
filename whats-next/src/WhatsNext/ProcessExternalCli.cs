namespace WhatsNext;

public sealed class ProcessExternalCli : IExternalCli
{
    public ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args)
        => throw new NotImplementedException();
}
