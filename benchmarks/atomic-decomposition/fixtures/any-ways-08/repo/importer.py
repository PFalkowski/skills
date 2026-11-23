import csv
import sys

from store import open_db


def load(path, db):
    existing = {row[0] for row in db.execute("SELECT ref FROM invoices")}
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            if row["ref"] in existing:
                continue
            db.execute("INSERT INTO invoices VALUES (?, ?)", (row["ref"], int(row["amount"])))


if __name__ == "__main__":
    db = open_db()
    load(sys.argv[1], db)
    for row in db.execute("SELECT ref, amount FROM invoices ORDER BY rowid"):
        print(*row)
