import json
from pathlib import Path

from listkeeper import schema

DEFAULT = Path(__file__).resolve().parent.parent / "subscribers.json"


class StoreError(Exception):
    pass


class Store:
    def __init__(self, path, records=()):
        self.path = Path(path)
        self.records = {}
        for record in records:
            self.records[schema.normal_email(record["email"])] = record

    @classmethod
    def open(cls, path=None):
        path = Path(path or DEFAULT)
        rows = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        return cls(path, rows)

    def insert(self, record, validate=True):
        record = dict(record, email=schema.normal_email(record["email"]))
        if validate:
            try:
                schema.check_record(record)
            except schema.SchemaError as exc:
                raise StoreError(str(exc)) from None
            if record["email"] in self.records:
                raise StoreError(f"{record['email']} is already subscribed")
        self.records[record["email"]] = record
        return record

    def bulk_load(self, records):
        for record in records:
            self.insert(record, validate=False)

    def get(self, email):
        return self.records.get(schema.normal_email(email))

    def remove(self, email):
        if self.records.pop(schema.normal_email(email), None) is None:
            raise StoreError(f"{email} is not subscribed")

    def clear(self):
        self.records.clear()

    def all(self):
        return [self.records[key] for key in sorted(self.records)]

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.all(), indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)
