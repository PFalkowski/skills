import csv
from dataclasses import dataclass

from listkeeper import clean, merge
from listkeeper.store import StoreError

COLUMNS = ["email", "name", "city", "topics"]


@dataclass
class Result:
    added: int = 0
    merged: int = 0
    rejected: int = 0


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"{path}: expected columns {','.join(COLUMNS)}")
        return list(reader)


def group(rows, result):
    groups = {}
    for row in rows:
        cleaned = clean.clean_row(row)
        if cleaned is None:
            result.rejected += 1
            continue
        groups.setdefault(cleaned["email"], []).append(cleaned)
    return groups


def merge_duplicates(store, rows, result):
    existing = store.get(rows[0]["email"])
    combined = merge.merge(([existing] if existing else []) + rows)
    store.insert(combined, validate=False)
    result.merged += len(rows) - 1
    result.added += 0 if existing else 1


def import_rows(store, rows):
    result = Result()
    for email, members in group(rows, result).items():
        if len(members) > 1:
            merge_duplicates(store, members, result)
            continue
        try:
            store.insert(members[0])
            result.added += 1
        except StoreError:
            result.rejected += 1
    return result


def import_file(store, path):
    return import_rows(store, read_rows(path))
