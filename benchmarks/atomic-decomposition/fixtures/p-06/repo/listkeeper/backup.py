import json

from listkeeper import schema

VERSION = 1


def write(records, path):
    data = {"version": VERSION, "subscribers": records}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def read(path):
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or data.get("version") != VERSION:
        raise ValueError(f"{path}: not a version {VERSION} backup")
    records = data.get("subscribers")
    if not isinstance(records, list):
        raise ValueError(f"{path}: no subscriber list")
    for number, record in enumerate(records, 1):
        try:
            schema.check_record(record)
        except schema.SchemaError as exc:
            raise ValueError(f"{path}: subscriber {number}: {exc}") from None
    return records
