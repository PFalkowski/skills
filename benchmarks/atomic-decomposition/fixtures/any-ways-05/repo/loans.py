from members import MEMBERS

FINE_LIMIT = 5
LOANS = []


def borrow(name, book):
    if MEMBERS[name]["fines"] > FINE_LIMIT:
        raise PermissionError(name)
    LOANS.append((name, book))
    return True
