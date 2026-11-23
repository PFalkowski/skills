RATES = {"book": 10, "dvd": 25, "game": 25}
GRACE_DAYS = 3
CAP_CENTS = 500


def late_fee_cents(kind, days_late):
    billable = max(0, days_late - GRACE_DAYS)
    return min(billable * RATES[kind], CAP_CENTS)


def format_cents(cents):
    return f"{cents // 100}.{cents % 100:02d}"
