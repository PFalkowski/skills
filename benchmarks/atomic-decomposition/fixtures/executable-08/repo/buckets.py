STEP = 0.1


def bucket(value):
    return int(value // STEP)


def histogram(values):
    counts = {}
    for value in values:
        key = bucket(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))
