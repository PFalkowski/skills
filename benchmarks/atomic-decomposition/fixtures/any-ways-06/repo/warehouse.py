STOCK = {"pen": 10}


def reserve(sku, qty):
    left = STOCK[sku] - qty
    if left < 0:
        raise ValueError("short")
    STOCK[sku] = left
    return left
