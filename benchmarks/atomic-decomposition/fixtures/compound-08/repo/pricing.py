from decimal import Decimal, ROUND_HALF_UP

TAX = Decimal("0.23")
THRESHOLD = Decimal(100)
PENNY = Decimal("0.01")


def cents(x):
    return x.quantize(PENNY, ROUND_HALF_UP)


def line_amount(price, qty):
    return Decimal(price) * qty


def subtotal(lines):
    return sum((line_amount(p, q) for p, q in lines), Decimal(0))


def discount(sub):
    return sub * Decimal("0.10") if sub > THRESHOLD else Decimal(0)


def total(lines):
    sub = subtotal(lines)
    return cents((sub - discount(sub)) * (1 + TAX))
