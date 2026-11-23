LIMITS = {"std": 30, "express": 20}


def check_weight(p):
    limit = LIMITS.get(p["service"])
    if limit is not None and p["kg"] > limit:
        raise ValueError("too heavy")
