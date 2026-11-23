import re

PATTERN = re.compile(r"^[A-Z]{2}\d{3}$")


def is_valid(code):
    return PATTERN.match(code) is not None
