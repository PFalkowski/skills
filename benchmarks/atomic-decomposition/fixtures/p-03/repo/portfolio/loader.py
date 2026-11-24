import csv
from pathlib import Path

from portfolio.model import STATUS_NAMES, Project

ROOT = Path(__file__).resolve().parent.parent
HEADER = ["id", "name", "owner", "status", "budget", "spent"]


class DataError(ValueError):
    pass


def amount(text, row_id, column):
    try:
        value = int(text)
    except ValueError:
        raise DataError(f"{row_id}: {column} must be whole euros, got {text!r}") from None
    if value < 0:
        raise DataError(f"{row_id}: {column} is negative")
    return value


def parse_row(row):
    row_id = row["id"].strip()
    status = row["status"].strip().upper()
    if status not in STATUS_NAMES:
        raise DataError(f"{row_id}: unknown status {status!r}")
    return Project(row_id, row["name"].strip(), row["owner"].strip(), status,
                   amount(row["budget"], row_id, "budget"), amount(row["spent"], row_id, "spent"))


def load(path=ROOT / "projects.csv"):
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != HEADER:
            raise DataError(f"expected columns {HEADER}, got {reader.fieldnames}")
        projects = [parse_row(row) for row in reader]
    ids = [p.id for p in projects]
    if len(ids) != len(set(ids)):
        raise DataError("duplicate project ids")
    return projects
