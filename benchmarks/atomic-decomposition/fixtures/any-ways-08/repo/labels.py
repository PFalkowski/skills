import re

SEAT = re.compile(r"([A-Za-z])(\d+)")


def canon(label):
    m = SEAT.fullmatch(label)
    if not m:
        raise ValueError(label)
    return m.group(1).upper() + str(int(m.group(2)))
