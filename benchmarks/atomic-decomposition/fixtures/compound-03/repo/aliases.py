import os

here = os.path.dirname(os.path.abspath(__file__))
ALIASES = {}
with open(os.path.join(here, "legacy.txt")) as f:
    for line in f:
        old, new = line.split()
        ALIASES[old] = new


def canonical(name):
    name = name.strip().lower()
    while name in ALIASES:
        name = ALIASES[name]
    return name
