from prices import PRICES


def line_total(item, qty):
    return round(PRICES[item] * qty, 2)


def receipt(order):
    lines = [f"{item} x{qty} {line_total(item, qty):.2f}" for item, qty in order]
    total = sum(line_total(item, qty) for item, qty in order)
    return lines + [f"total {total:.2f}"]
