import csv
from dataclasses import dataclass

from mediahub import dates

COLUMNS = ["id", "owner", "name", "size", "uploaded"]


@dataclass(frozen=True)
class Upload:
    id: str
    owner: str
    name: str
    size: int
    uploaded: object


class IndexFileError(ValueError):
    pass


def parse_row(path, number, row):
    where = f"{path}:{number}"
    if not row["id"] or not row["owner"].strip():
        raise IndexFileError(f"{where}: id and owner are required")
    try:
        size = int(row["size"])
    except ValueError:
        raise IndexFileError(f"{where}: size must be a whole number of bytes") from None
    if size < 0:
        raise IndexFileError(f"{where}: negative size")
    try:
        uploaded = dates.parse(row["uploaded"])
    except ValueError as exc:
        raise IndexFileError(f"{where}: {exc}") from None
    return Upload(row["id"], row["owner"].strip(), row["name"], size, uploaded)


def read(path):
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            raise IndexFileError(f"{path}: expected columns {COLUMNS}")
        uploads = [parse_row(path, number, row) for number, row in enumerate(reader, 2)]
    seen = set()
    for upload in uploads:
        if upload.id in seen:
            raise IndexFileError(f"{path}: duplicate id {upload.id}")
        seen.add(upload.id)
    return uploads


def write(path, uploads):
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(COLUMNS)
        for u in uploads:
            writer.writerow([u.id, u.owner, u.name, u.size, u.uploaded.isoformat()])
    tmp.replace(path)
