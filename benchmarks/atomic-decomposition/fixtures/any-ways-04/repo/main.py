from session import Session
from sweep import purge

s = Session(0)
print(len(purge([s], 2700)))
print(len(purge([s], 8 * 3600 + 1)))
