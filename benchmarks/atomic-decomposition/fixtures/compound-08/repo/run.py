from invoice import render
from pricing import total

print(render([("33.335", 3)]))
print(render([("50.00", 2)]))
print(render([("40.005", 1), ("40.005", 1), ("20.003", 1)]))
print(total([("100.01", 1)]))
