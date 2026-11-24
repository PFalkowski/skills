import calendar


def last_day(year, month):
    return calendar.monthrange(year, month)[1]


def fits(parts):
    return parts[2] <= last_day(parts[0], parts[1])


def invoice_day(year, month):
    return last_day(year, month)
