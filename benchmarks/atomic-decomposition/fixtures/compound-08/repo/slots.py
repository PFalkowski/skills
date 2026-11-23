def overlaps(a, b):
    return a["room"] == b["room"] and a["start"] < b["end"] and b["start"] < a["end"]
