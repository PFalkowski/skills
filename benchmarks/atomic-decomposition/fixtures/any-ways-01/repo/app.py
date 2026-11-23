from validate import check
from store import save


def book(db, b):
    check(b)
    save(db, b)
    return len(db)


if __name__ == "__main__":
    db = []
    for b in [
        {"room": "A", "start": "9:00", "end": "10:00"},
        {"room": "A", "start": "10:00", "end": "9:30"},
    ]:
        try:
            print(book(db, b))
        except ValueError as e:
            print("rejected:", e)
    print(db)
