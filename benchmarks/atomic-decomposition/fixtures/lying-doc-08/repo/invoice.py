from tax import tax_cents


def invoice(lines, rate_bp):
    net = sum(price * qty for price, qty in lines)
    tax = sum(tax_cents(price * qty, rate_bp) for price, qty in lines)
    return {"net": net, "tax": tax, "gross": net + tax}
