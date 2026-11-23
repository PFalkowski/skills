ALIASES = {"item": "sku", "qty": "quantity"}
UNITS = ("each", "box", "kg")


def normalize(message):
    return {ALIASES.get(key, key): value for key, value in message.items()}


def parse_order(message):
    fields = normalize(message)
    fields.setdefault("unit", "each")
    if fields["unit"] not in UNITS:
        raise ValueError("unit")
    fields["quantity"] = int(fields["quantity"])
    if fields["quantity"] < 1:
        raise ValueError("quantity")
    return fields
