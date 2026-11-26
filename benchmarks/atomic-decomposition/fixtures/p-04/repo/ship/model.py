from dataclasses import asdict, dataclass, field

STATUSES = ("draft", "labelled")


@dataclass
class Shipment:
    id: str
    recipient: str
    address: str
    postcode: str
    weight: float
    status: str = "draft"
    service: str = None
    label: str = None
    events: list = field(default_factory=list)
    extra: dict = field(default_factory=dict)

    @property
    def labelled(self):
        return self.status == "labelled"

    def to_dict(self):
        return asdict(self)

    def summary(self):
        service = self.service or "-"
        return f"{self.id}\t{self.status}\t{service}\t{self.recipient}\t{self.address}, {self.postcode}"
