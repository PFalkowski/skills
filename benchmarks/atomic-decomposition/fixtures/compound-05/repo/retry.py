from backoff import wait_for
from settings import ATTEMPTS, FATAL


class HttpError(Exception):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


def call_with_retry(fn, sleep):
    for n in range(ATTEMPTS):
        try:
            return fn()
        except HttpError as e:
            if e.status in FATAL or n == ATTEMPTS - 1:
                raise
            sleep(wait_for(n))
