MAIN = ["7,Ann", "8,Bo"]
LATE = ["7,Ann", "9,Cy"]


def parse(lines):
    return [l.split(",") for l in lines]


def main_rows():
    return [{"id": int(i), "name": n} for i, n in parse(MAIN)]


def late_rows():
    return [{"id": i, "name": n} for i, n in parse(LATE)]
