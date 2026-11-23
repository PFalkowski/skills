from checkout import total


def line(name, list_cents, member=False, coupon=None):
    return f"{name}: {total(list_cents, member, coupon)}"
