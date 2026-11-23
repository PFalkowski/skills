import re

PATTERN = re.compile(r"[a-z]+-\d+$")


def normalise(raw):
    return raw.rstrip(" ")


def is_valid(raw):
    return PATTERN.fullmatch(normalise(raw)) is not None


def load(path):
    with open(path) as handle:
        return [line for line in handle]
