import sys

import api

names = sys.argv[1:] or ["report.txt", "../x", "a/../b.txt"]
for name in names:
    print(name, api.handle(name, b"x"))
