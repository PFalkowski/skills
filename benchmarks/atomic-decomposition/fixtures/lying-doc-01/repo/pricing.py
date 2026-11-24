def to_cents(price):
    return round(float(price) * 100)


def line_cents(price, quantity):
    return to_cents(price) * quantity


def money(cents):
    return f"{cents // 100}.{cents % 100:02d}"
