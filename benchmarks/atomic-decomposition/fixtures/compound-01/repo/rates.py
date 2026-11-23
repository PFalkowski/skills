BASE_RATE = 0.25

MULTIPLIER = {"disc": 2}


def daily_rate(media):
    return BASE_RATE * MULTIPLIER.get(media, 1)
