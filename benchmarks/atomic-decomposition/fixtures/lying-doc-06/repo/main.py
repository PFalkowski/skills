from runner import run

calls = []


def never(attempt):
    calls.append(attempt)
    return False


print(run(never))
print(calls)
print(run(lambda a: a == 2))
