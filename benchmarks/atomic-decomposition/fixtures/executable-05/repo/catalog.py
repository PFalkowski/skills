from functools import lru_cache

PRICES = {"pen": 120, "pad": 450, "ink": 800}


@lru_cache(maxsize=None)
def new_lines(kind):
    return []
