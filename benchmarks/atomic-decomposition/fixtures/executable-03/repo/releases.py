from keys import numeric_key


def latest(versions):
    return max(versions, key=numeric_key)
