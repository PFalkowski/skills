import dates
import month_ends

TAKEN = {"2024-03-01"}


def book(start, end):
    try:
        a = dates.parse(start)
        b = dates.parse(end)
    except ValueError:
        return {"status": "rejected"}
    if not month_ends.fits(b):
        return {"status": "rejected"}
    if dates.day_number(b) <= dates.day_number(a):
        return {"status": "rejected"}
    if start in TAKEN or end in TAKEN:
        return {"status": "rejected"}
    return {
        "status": "booked",
        "nights": dates.day_number(b) - dates.day_number(a),
        "invoice": month_ends.invoice_day(a[0], a[1]),
    }
