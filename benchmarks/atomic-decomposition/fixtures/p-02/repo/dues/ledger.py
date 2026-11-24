from dataclasses import dataclass


@dataclass(frozen=True)
class Entry:
    member_id: str
    kind: str
    amount_cents: object
    reason: str


class Ledger:
    def __init__(self):
        self.entries = []

    def add(self, member_id, kind, amount_cents, reason):
        entry = Entry(member_id, kind, amount_cents, reason)
        self.entries.append(entry)
        return entry

    def balance(self, member_id):
        total = 0
        for entry in self.entries:
            if entry.member_id != member_id:
                continue
            total += entry.amount_cents if entry.kind == "charge" else -entry.amount_cents
        return total

    def for_member(self, member_id):
        return [e for e in self.entries if e.member_id == member_id]
