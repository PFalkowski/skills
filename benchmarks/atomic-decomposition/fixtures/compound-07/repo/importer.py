from customers import KNOWN


def read(lines):
    rows = []
    for line in lines[1:]:
        _, customer, amount = line.split(",")
        rows.append((customer, amount))
    return rows


def totals(rows):
    sums = {}
    rejected = 0
    for customer, amount in rows:
        if customer not in KNOWN:
            rejected += 1
            continue
        sums[customer] = sums.get(customer, 0) + float(amount or 0)
    return {name: "%.2f" % value for name, value in sums.items()}, rejected


def report(table):
    return sorted(table.items(), key=lambda item: (item[1], item[0]), reverse=True)
