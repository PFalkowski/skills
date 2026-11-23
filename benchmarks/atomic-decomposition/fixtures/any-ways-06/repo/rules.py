def has_fields(order):
    return "sku" in order and "qty" in order


def positive(qty):
    return qty > 0


def in_stock(stock, qty):
    return qty <= stock.get("total", 0)
