def to_cents(text):
    whole, _, frac = text.partition(".")
    sign = -1 if whole.startswith("-") else 1
    return sign * (abs(int(whole)) * 100 + int(frac.ljust(2, "0")))


def fmt(cents):
    sign = "-" if cents < 0 else ""
    return f"{sign}{abs(cents) // 100}.{abs(cents) % 100:02d}"
