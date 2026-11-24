import csv
from dataclasses import dataclass, field

from ship import postcodes

COLUMNS = ["id", "address", "postcode"]


@dataclass
class Result:
    seen: int = 0
    changed: list = field(default_factory=list)
    skipped: list = field(default_factory=list)


def apply_row(store, row, result):
    result.seen += 1
    shipment = store.get(row["id"])
    if shipment is None:
        raise ValueError(f"no shipment {row['id']}")
    postcode = row["postcode"].strip()
    if not postcodes.valid(postcode):
        raise ValueError(f"{shipment.id}: bad postcode {postcode!r}")
    if shipment.labelled:
        result.skipped.append(shipment.id)
        return
    shipment.address = postcodes.clean_address(row["address"])
    shipment.postcode = postcode
    result.changed.append(shipment.id)


def apply_file(store, path):
    result = Result()
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"{path}: expected columns {','.join(COLUMNS)}")
        for row in reader:
            apply_row(store, row, result)
    return result
