class Gave_up(Exception):
    pass


TRIES = 3
BASE = 1


def delay(n):
    return BASE * 2 ** n


def more(n):
    return n + 1 < TRIES


def run(job, sleep):
    last = None
    for n in range(TRIES):
        try:
            return job()
        except ValueError as err:
            last = err
            if more(n):
                sleep(delay(n))
    raise Gave_up(str(last))
