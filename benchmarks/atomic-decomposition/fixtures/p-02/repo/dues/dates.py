DAYS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def parse(text):
    year, month, day = (int(part) for part in text.split("-"))
    if not 1 <= month <= 12 or not 1 <= day <= days_in(year, month):
        raise ValueError(f"bad date {text!r}")
    return year, month, day


def leap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def days_in(year, month):
    return 29 if month == 2 and leap(year) else DAYS[month - 1]


def month_end_after(text):
    year, month, _ = parse(text)
    year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return f"{year:04d}-{month:02d}-{days_in(year, month):02d}"


def months_until(start, end):
    y1, m1 = (int(x) for x in start.split("-")[:2])
    y2, m2 = (int(x) for x in end.split("-")[:2])
    return (y2 - y1) * 12 + (m2 - m1)
