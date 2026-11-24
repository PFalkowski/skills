import os
import tempfile

from importer import import_orders, total_cents

here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as tmp:
    db_path = os.path.join(tmp, "orders.json")
    for _ in range(2):
        db, skipped = import_orders(os.path.join(here, "sample.csv"), db_path)
        print(len(db), total_cents(db), skipped)
