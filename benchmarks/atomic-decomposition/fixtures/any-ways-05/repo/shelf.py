from loans import LOANS
from members import MEMBERS

LATE_FEE_CAP = 5


def pickup(name, book):
    member = MEMBERS[name]
    if member["late_fees"] > LATE_FEE_CAP:
        raise PermissionError(name)
    if book not in member["holds"]:
        raise KeyError(book)
    member["holds"].remove(book)
    LOANS.append((name, book))
    return True
