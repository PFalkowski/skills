from library import LIMIT, Library

lib = Library()
for n in range(LIMIT):
    assert lib.borrow("ann", "b%d" % n) == "borrowed"
try:
    lib.borrow("ann", "b9")
    raise SystemExit("fifth loan accepted")
except ValueError:
    pass
assert lib.borrow("bob", "b0") == "queued"
lib.give_back("ann", "b0")
assert lib.count("bob") == 1
print("ok")
