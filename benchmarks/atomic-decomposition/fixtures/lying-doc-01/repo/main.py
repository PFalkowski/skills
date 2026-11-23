from fees import format_cents, late_fee_cents

for kind, days in [("book", 5), ("dvd", 30), ("game", 12)]:
    print(kind, days, format_cents(late_fee_cents(kind, days)))
