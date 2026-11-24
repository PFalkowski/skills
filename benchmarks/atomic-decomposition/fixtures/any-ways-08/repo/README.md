# Seat hall

Seat labels are normalized by `labels.canon`, so "A1", "a1" and "A01" name
the same seat. A seat can be held for a short time by one user before
booking. `store.load` restores saved bookings from lines of the form
`user,label` and raises if a seat is already taken.
