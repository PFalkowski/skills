from summary import Summary


def parse(line):
    parts = line.split()
    if len(parts) != 3:
        return None
    try:
        return int(parts[1]), int(parts[2])
    except ValueError:
        return None


def load_all(handle):
    for line in handle:
        record = parse(line)
        if record is not None:
            yield record


def summarize(path):
    summary = Summary()
    with open(path) as handle:
        for status, ms in load_all(handle):
            summary.add(status, ms)
    return summary
