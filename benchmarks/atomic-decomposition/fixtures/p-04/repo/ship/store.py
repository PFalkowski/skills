import json
import os
from pathlib import Path

from ship.model import Shipment

DEFAULT = Path(__file__).resolve().parent.parent / "shipments.json"


class Store:
    def __init__(self, path, shipments):
        self.path = Path(path)
        self.shipments = {s.id: s for s in shipments}

    @classmethod
    def open(cls, path=None):
        path = Path(path or os.environ.get("SHIPCTL_DATA") or DEFAULT)
        rows = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        return cls(path, [Shipment(**row) for row in rows])

    def get(self, shipment_id):
        return self.shipments.get(shipment_id.strip().upper())

    def add(self, shipment):
        self.shipments[shipment.id] = shipment
        return shipment

    def next_id(self):
        numbers = [int(key.split("-")[1]) for key in self.shipments]
        return f"S-{max(numbers, default=1000) + 1}"

    def all(self):
        return [self.shipments[key] for key in sorted(self.shipments)]

    def save(self):
        rows = [s.to_dict() for s in self.all()]
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)
