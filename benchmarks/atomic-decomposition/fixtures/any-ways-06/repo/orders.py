import rules
import warehouse


def place(order):
    if not rules.has_fields(order):
        raise ValueError("fields")
    return warehouse.reserve(order["sku"], order["qty"])


def place_bulk(orders):
    if not all(rules.positive(o["qty"]) for o in orders):
        raise ValueError("qty")
    return [place(o) for o in orders]
