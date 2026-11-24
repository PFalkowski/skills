from dataclasses import dataclass

from dues.money import to_cents


@dataclass(frozen=True)
class Plan:
    name: str
    price_cents: int
    peak_access: bool


PLANS = {
    "monthly": Plan("monthly", to_cents("59.00"), True),
    "student": Plan("student", to_cents("39.00"), True),
    "off-peak": Plan("off-peak", to_cents("45.00"), False),
}

JOINING_FEE_CENTS = to_cents("25.00")
GUEST_PASS_CENTS = to_cents("12.00")


def get(name):
    try:
        return PLANS[name]
    except KeyError:
        raise ValueError(f"unknown plan {name!r}; choose from {', '.join(PLANS)}") from None
