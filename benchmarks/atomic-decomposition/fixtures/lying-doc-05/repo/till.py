from money import to_cents, format_cents


def total(typed_prices):
    return sum(to_cents(p) for p in typed_prices)


if __name__ == "__main__":
    prices = [0.10, 1.005, 2.675]
    print(format_cents(total(prices)))
    for p in prices:
        print(p, to_cents(p))
