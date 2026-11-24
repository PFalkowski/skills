from dataclasses import dataclass, field


@dataclass(frozen=True)
class Delivery:
    channel: str
    recipient: str
    body: str
    attempt: int = 1


@dataclass
class Outbox:
    items: list = field(default_factory=list)
    acknowledged: set = field(default_factory=set)

    def put(self, channel, recipient, body, attempt=1):
        delivery = Delivery(channel, recipient, body, attempt)
        self.items.append(delivery)
        return delivery

    def acknowledge(self, recipient):
        self.acknowledged.add(recipient)

    def is_acknowledged(self, recipient):
        return recipient in self.acknowledged

    def for_channel(self, channel):
        return [d for d in self.items if d.channel == channel]
