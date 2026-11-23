import loans
import shelf
from members import MEMBERS

ROUTES = {"borrow": loans.borrow, "pickup": shelf.pickup}


def serve(route, name, book):
    try:
        ROUTES[route](name, book)
        return "ok"
    except (PermissionError, KeyError):
        return "refused"


if __name__ == "__main__":
    for name in MEMBERS:
        print(name, "borrow", serve("borrow", name, "b1"))
