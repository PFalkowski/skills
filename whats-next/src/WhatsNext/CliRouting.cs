namespace WhatsNext;

public enum RouteKind
{
    ShowBoard,
    StartItem,
    Prune,
    Invalid,
}

public readonly record struct Route(RouteKind Kind, int Number = 0);

// Ports the closing if/elseif/else chain of wip.ps1 at 5fe502c: no item prints the board, the
// literal word "prune" prunes, digits-only launches that item, anything else is a usage error.
public static class CliRouting
{
    public static Route Classify(string? item)
    {
        if (string.IsNullOrEmpty(item))
        {
            return new Route(RouteKind.ShowBoard);
        }
        if (item == "prune")
        {
            return new Route(RouteKind.Prune);
        }
        if (item.Length > 0 && item.All(char.IsAsciiDigit))
        {
            return new Route(RouteKind.StartItem, int.Parse(item));
        }
        return new Route(RouteKind.Invalid);
    }
}
