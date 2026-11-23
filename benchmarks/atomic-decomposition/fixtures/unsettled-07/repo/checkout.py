from discounts import discounted
from settings import min_price_percent


def total(list_cents, member=False, coupon=None):
    floor = -(-list_cents * min_price_percent() // 100)
    return max(discounted(list_cents, member, coupon), floor)
