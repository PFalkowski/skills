from datetime import date, timedelta


def parse_holidays(texts):
    return {date.fromisoformat(t) for t in texts}


def is_workday(day, holidays):
    return day.weekday() < 5 and day not in holidays


def add_workdays(start, count, holidays=()):
    skip = parse_holidays(holidays)
    day = start
    while count > 0:
        day += timedelta(days=1)
        if is_workday(day, skip):
            count -= 1
    return day
