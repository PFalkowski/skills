from loader import load

with open("old.cfg") as f:
    print(load(f.read()))
print(load(""))
