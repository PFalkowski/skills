from decimal import Decimal, getcontext

getcontext().prec = 12

CENT = Decimal("0.01")


def line_total(price, qty):
    return (Decimal(price) * qty).quantize(CENT)


def invoice_total(lines):
    return sum((line_total(p, q) for p, q in lines), Decimal("0"))
