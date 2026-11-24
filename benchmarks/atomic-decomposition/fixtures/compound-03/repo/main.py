import os

from server import handle

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "captured.txt")) as f:
    for line in f:
        print(line.strip(), handle(line))
