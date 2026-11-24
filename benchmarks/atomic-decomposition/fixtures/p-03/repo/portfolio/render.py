import csv
import io

FORMATS = ("text", "csv")
RIGHT = {"budget", "spent", "left", "used"}


def cell(project, column):
    value = project.value(column)
    if column == "used":
        return f"{value}%"
    if column in ("budget", "spent", "left"):
        return f"{value:,}"
    return str(value)


def text(projects, columns):
    rows = [list(columns)] + [[cell(p, c) for c in columns] for p in projects]
    widths = [max(len(row[i]) for row in rows) for i in range(len(columns))]
    lines = []
    for row in rows:
        parts = [value.rjust(w) if col in RIGHT else value.ljust(w)
                 for value, w, col in zip(row, widths, columns)]
        lines.append("  ".join(parts).rstrip())
    lines.append(f"{len(projects)} projects")
    return "\n".join(lines) + "\n"


def as_csv(projects, columns):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(columns)
    for p in projects:
        writer.writerow([p.value(c) for c in columns])
    return out.getvalue()


def totals(owners, overall):
    width = max([len(owner) for owner in owners] + [len("all")])
    lines = [f"{'owner'.ljust(width)}  {'projects':>8}  {'budget':>9}  {'spent':>9}"]
    for owner, entry in owners.items():
        lines.append(f"{owner.ljust(width)}  {entry['projects']:>8}  {entry['budget']:>9,}"
                     f"  {entry['spent']:>9,}")
    count = sum(entry["projects"] for entry in owners.values())
    lines.append(f"{'all'.ljust(width)}  {count:>8}  {overall['budget']:>9,}"
                 f"  {overall['spent']:>9,}")
    return "\n".join(lines) + "\n"


def render(projects, columns, fmt):
    if fmt == "csv":
        return as_csv(projects, columns)
    return text(projects, columns)
