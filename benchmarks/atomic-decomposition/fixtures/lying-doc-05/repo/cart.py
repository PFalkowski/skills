from shipping import shipping_cents


def apply_coupon(subtotal_cents, percent_off):
    return subtotal_cents - subtotal_cents * percent_off // 100


def quote(items, percent_off=0):
    subtotal = sum(price * qty for price, qty in items)
    shipping = shipping_cents(subtotal)
    total = apply_coupon(subtotal, percent_off) + shipping
    return {"subtotal": subtotal, "shipping": shipping, "total": total}
