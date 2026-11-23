import re

UNITS = {"s": 1, "m": 60, "h": 3600}
PATTERN = re.compile(r"(\d+)([smh])")


def parse(text):
    found = PATTERN.fullmatch(text)
    if not found:
        raise ValueError(text)
    number, unit = found.groups()
    return float(number) * UNITS[unit]
