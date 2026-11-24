def to_cents(dollars):
    return int(dollars * 100 + 0.5)


def format_cents(cents):
    return f"{cents // 100}.{cents % 100:02d}"
