from retry import retry

waits = []


def always_fails():
    raise ValueError("down")


try:
    retry(always_fails, sleep=waits.append)
except ValueError as exc:
    print("raised", exc)
print(waits)
