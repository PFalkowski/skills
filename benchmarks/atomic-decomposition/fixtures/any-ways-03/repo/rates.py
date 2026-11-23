BANDS = [(5, 400), (15, 900), (30, 1800)]


def quote(kg):
    for top, cents in BANDS:
        if kg <= top:
            return cents
    raise ValueError("no rate band")
