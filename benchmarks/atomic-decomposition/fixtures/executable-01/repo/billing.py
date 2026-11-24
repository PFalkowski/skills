from rates import RATES


def billed_kg(grams):
    return max(1, round(grams / 1000))


def cost(grams, zone):
    return billed_kg(grams) * RATES[zone]
