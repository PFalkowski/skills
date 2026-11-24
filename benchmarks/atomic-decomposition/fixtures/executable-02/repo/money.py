from decimal import Decimal, ROUND_HALF_UP


def to_cents(amount):
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
