from datetime import date

from catalog import ITEMS
from rates import daily_rate

MAX_FEE = 10.00


def days_late(due, returned):
    return max(0, (returned - due).days)


def late_fee(item_id, due, returned):
    rate = daily_rate(ITEMS[item_id]["format"])
    return round(min(days_late(due, returned) * rate, MAX_FEE), 2)


def parse(text):
    year, month, day = text.split("-")
    return date(int(year), int(month), int(day))
