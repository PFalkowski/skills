import re


def make(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
