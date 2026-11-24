import re

PATTERN = re.compile(r"(\d{4})-(\d{2})-(\d{2})$")
LIMITS = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


def parse(text):
    m = PATTERN.match(text)
    if not m:
        raise ValueError("bad date")
    y, mo, d = map(int, m.groups())
    if not 1 <= mo <= 12 or not 1 <= d <= LIMITS.get(mo - 1, 31):
        raise ValueError("bad date")
    return y, mo, d


def day_number(parts):
    y, mo, d = parts
    return y * 372 + (mo - 1) * 31 + d
