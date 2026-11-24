from pricing import line_cents, money


def render(items):
    rows = []
    total = 0
    for name, price, quantity in items:
        cents = line_cents(price, quantity)
        total += cents
        rows.append(f"{name:<10}{quantity:>3} {money(cents):>8}")
    rows.append(f"{'TOTAL':<13} {money(total):>8}")
    return "\n".join(rows)
