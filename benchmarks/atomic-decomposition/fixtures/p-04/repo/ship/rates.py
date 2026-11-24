from decimal import Decimal, ROUND_HALF_UP

SERVICES = {
    "economy": (Decimal("1.20"), Decimal("4.50")),
    "standard": (Decimal("1.80"), Decimal("6.00")),
    "express": (Decimal("3.10"), Decimal("9.50")),
}
ZONE_SURCHARGE = {"north": Decimal("0"), "harbour": Decimal("0"), "east": Decimal("1.50"),
                  "south": Decimal("2.00")}


def price(service, weight, zone):
    per_kg, minimum = SERVICES[service]
    base = max(per_kg * Decimal(str(weight)), minimum)
    return (base + ZONE_SURCHARGE[zone]).quantize(Decimal("0.01"), ROUND_HALF_UP)
