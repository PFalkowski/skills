ZONES = {"44": "north", "45": "harbour", "46": "east", "47": "east", "48": "south"}


def valid(postcode):
    return len(postcode) == 4 and postcode.isdigit() and postcode[:2] in ZONES


def zone(postcode):
    if not valid(postcode):
        raise ValueError(f"unknown postcode {postcode!r}")
    return ZONES[postcode[:2]]


def clean_address(text):
    return " ".join(text.replace(",", " ").split())
