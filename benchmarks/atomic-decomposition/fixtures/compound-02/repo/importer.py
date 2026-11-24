import csv

import store


def import_orders(csv_path, db_path):
    db = store.load(db_path)
    skipped = []
    with open(csv_path, newline="") as f:
        for line, row in enumerate(csv.DictReader(f), start=2):
            try:
                qty = int(row["qty"])
                price = int(row["price_cents"])
            except (ValueError, TypeError):
                skipped.append(line)
                continue
            db[row["id"]] = {"qty": qty, "price_cents": price}
    store.save(db_path, db)
    return db, skipped


def total_cents(db):
    return sum(o["qty"] * o["price_cents"] for o in db.values())
