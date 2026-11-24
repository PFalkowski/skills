from billing import cost

PARCELS = [(2500, "B"), (3500, "A"), (400, "C")]

for grams, zone in PARCELS:
    print(grams, zone, f"{cost(grams, zone):.2f}")
