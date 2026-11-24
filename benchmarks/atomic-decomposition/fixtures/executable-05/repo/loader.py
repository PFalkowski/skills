def parse(text):
    rows = []
    for line in text.splitlines():
        if line:
            label, count = line.split("|")
            rows.append((label, int(count)))
    return rows
