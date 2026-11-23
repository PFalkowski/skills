FREE_FROM_CENTS = 5000
FLAT_CENTS = 695


def shipping_cents(subtotal_cents):
    if subtotal_cents >= FREE_FROM_CENTS:
        return 0
    return FLAT_CENTS
