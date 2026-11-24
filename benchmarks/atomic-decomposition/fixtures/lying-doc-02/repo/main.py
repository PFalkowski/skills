from retry import Gave_up, run

calls = []
pauses = []


def broken():
    calls.append(1)
    raise ValueError("disk busy")


try:
    run(broken, pauses.append)
except Gave_up as err:
    print("gave up:", err)

print("calls:", len(calls))
print("pauses:", pauses)
