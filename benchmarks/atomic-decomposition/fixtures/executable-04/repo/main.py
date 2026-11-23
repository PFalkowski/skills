from codes import is_valid, load

for raw in load("codes.txt"):
    print(repr(raw), is_valid(raw))
