import sqlite3


def open_db():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE invoices (ref TEXT, amount INTEGER)")
    db.execute("INSERT INTO invoices VALUES ('INV-1', 100)")
    return db
