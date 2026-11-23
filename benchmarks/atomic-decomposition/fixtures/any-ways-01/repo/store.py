def minutes(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def save(db, b):
    length = minutes(b["end"]) - minutes(b["start"])
    if length <= 0:
        raise ValueError("empty slot")
    db.append((b["room"], minutes(b["start"]), length))
