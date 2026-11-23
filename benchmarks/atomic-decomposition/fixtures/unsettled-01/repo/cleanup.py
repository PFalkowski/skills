import json
import sys
from datetime import date, timedelta

from settings import RETENTION_DAYS


def purge(records, today, days=RETENTION_DAYS):
    cutoff = today - timedelta(days=days)
    return [r for r in records if date.fromisoformat(r["created"]) >= cutoff]


if __name__ == "__main__":
    path = sys.argv[1]
    today = date.fromisoformat(sys.argv[2])
    with open(path) as f:
        records = json.load(f)
    kept = purge(records, today)
    with open(path, "w") as f:
        json.dump(kept, f)
    print(len(records) - len(kept), "deleted,", len(kept), "kept")
