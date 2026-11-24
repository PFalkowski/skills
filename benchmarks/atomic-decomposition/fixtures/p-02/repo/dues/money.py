from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def parse(text):
    try:
        value = Decimal(str(text).strip().lstrip("$"))
    except InvalidOperation:
        raise ValueError(f"not an amount: {text!r}") from None
    if value != value.quantize(Decimal("0.01")):
        raise ValueError(f"more than two decimals: {text!r}")
    return value


def to_cents(text):
    return int((parse(text) * 100).to_integral_value(ROUND_HALF_UP))


def format_cents(amount_cents):
    sign = "-" if amount_cents < 0 else ""
    return f"{sign}${abs(amount_cents) / 100:.2f}"


def split_evenly(amount_cents, parts):
    base, extra = divmod(amount_cents, parts)
    return [base + 1 if i < extra else base for i in range(parts)]
