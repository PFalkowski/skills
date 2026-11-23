import os


def min_price_percent():
    return int(os.environ.get("MIN_PRICE_PERCENT", "70"))
