import csv

from limits import MAX_ROWS


def export(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) > MAX_ROWS:
        raise ValueError("too many rows: %d" % len(rows))
    return len(rows), sum(int(r["amount"]) for r in rows)
