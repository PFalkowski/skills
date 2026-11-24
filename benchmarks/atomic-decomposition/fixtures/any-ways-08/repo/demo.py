from seats import Hall
from store import load

h = Hall()
h.hold("ann", "A1")
h.book("ann", "A1")
load(h, ["cy,B2"])
print(h.booked)
