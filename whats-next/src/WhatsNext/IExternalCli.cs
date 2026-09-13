namespace WhatsNext;

public readonly record struct ExternalCliResult(
    int ExitCode,
    IReadOnlyList<string> StdOutLines,
    IReadOnlyList<string> StdErrLines);

public interface IExternalCli
{
    ExternalCliResult Run(string workingDirectory, string fileName, IReadOnlyList<string> args);
}
