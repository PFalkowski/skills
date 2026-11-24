from settings import BASE_DELAY, MAX_DELAY


def wait_for(n):
    return min(BASE_DELAY * 2 ** n, MAX_DELAY)
