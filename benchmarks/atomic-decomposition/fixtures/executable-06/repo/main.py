import money
import split

for amount in ("100.00", "-100.00"):
    parts = split.shares(money.to_cents(amount), 3)
    print(amount, [money.fmt(p) for p in parts], money.fmt(sum(parts)))
