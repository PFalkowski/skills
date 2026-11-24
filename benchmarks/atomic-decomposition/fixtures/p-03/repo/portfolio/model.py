from dataclasses import dataclass

STATUS_NAMES = {"ACT": "active", "PAU": "paused", "PRO": "proposed", "ARC": "archived"}


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    owner: str
    status_code: str
    budget: int
    spent: int

    @property
    def status(self):
        return STATUS_NAMES[self.status_code]

    @property
    def left(self):
        return self.budget - self.spent

    @property
    def used(self):
        return 0 if self.budget == 0 else round(100 * self.spent / self.budget)

    def value(self, column):
        return getattr(self, column)
