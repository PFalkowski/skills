def tax_cents(net_cents, rate_bp):
    return round(net_cents * rate_bp / 10000)
