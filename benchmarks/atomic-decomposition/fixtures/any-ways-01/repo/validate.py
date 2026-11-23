def check(b):
    if not b["room"]:
        raise ValueError("room required")
    if b["end"] < b["start"]:
        raise ValueError("ends before start")
