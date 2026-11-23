import time


def delays(attempts, base):
    return [base * 2 ** n for n in range(attempts - 1)]


def retry(fn, attempts=3, base=1, sleep=time.sleep):
    pending = delays(attempts, base)
    last = None
    for _ in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last = exc
            if pending:
                sleep(pending.pop(0))
    raise last
