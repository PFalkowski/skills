import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Member:
    id: str
    name: str
    plan: str
    paid_until: str
    card_expires: str
    overdue: bool = False


class Roster:
    def __init__(self, members):
        self.members = {m.id: m for m in members}

    def all(self):
        return [self.members[key] for key in sorted(self.members)]

    def get(self, member_id):
        try:
            return self.members[member_id]
        except KeyError:
            raise ValueError(f"no member {member_id}") from None

    def next_id(self):
        numbers = [int(key.split("-")[1]) for key in self.members]
        return f"M-{max(numbers, default=100) + 1}"

    def add(self, member):
        if member.id in self.members:
            raise ValueError(f"duplicate member {member.id}")
        self.members[member.id] = member
        return member


def load(path=ROOT / "members.json"):
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    return Roster(Member(**row) for row in rows)
