import re

PATTERN = re.compile(r"^[A-Z]{3}-\d{4}$")


def is_valid(code):
    return PATTERN.match(code) is not None
