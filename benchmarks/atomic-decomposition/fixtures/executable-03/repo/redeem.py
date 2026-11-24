from vouchers import is_valid


def redeem(code, used):
    if not is_valid(code):
        return "invalid"
    if code in used:
        return "already used"
    used.add(code)
    return "ok"
