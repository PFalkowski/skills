from billing import receipt

for line in receipt([("spoon", 3), ("mug", 2)]):
    print(line)
