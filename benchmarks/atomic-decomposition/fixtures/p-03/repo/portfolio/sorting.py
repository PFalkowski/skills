FIELDS = ("name", "owner", "budget", "spent", "left")
DESCENDING = {"budget", "spent", "left"}


def sort(projects, field):
    if field not in FIELDS:
        raise ValueError(f"cannot sort by {field!r}")
    reverse = field in DESCENDING
    key = (lambda p: (p.value(field), p.id)) if not reverse else (lambda p: (-p.value(field), p.id))
    return sorted(projects, key=key)
