import sys

from fees import late_fee, parse

LOANS = [
    ("B100", "2026-03-01", "2026-03-01"),
    ("B101", "2026-03-01", "2026-03-09"),
    ("M200", "2026-03-01", "2026-05-01"),
    ("D300", "2026-03-01", "2026-03-11"),
]


def main():
    total = 0.0
    for item_id, due, returned in LOANS:
        fee = late_fee(item_id, parse(due), parse(returned))
        total += fee
        print(f"{item_id} {fee:.2f}")
    print(f"total {total:.2f}")


if __name__ == "__main__":
    sys.exit(main())
