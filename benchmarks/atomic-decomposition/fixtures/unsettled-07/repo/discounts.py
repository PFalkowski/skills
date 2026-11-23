LOYALTY_PERCENT = 10
COUPONS = {"SAVE25": 25, "VIP40": 40}


def discounted(list_cents, member, coupon):
    price = list_cents
    if member:
        price = price * (100 - LOYALTY_PERCENT) // 100
    if coupon in COUPONS:
        price = price * (100 - COUPONS[coupon]) // 100
    return price
