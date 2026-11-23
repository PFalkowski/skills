from config import CAP, GRACE_DAYS, RATE_PER_DAY


def late_fee(member, days_late):
    if member.role == "staff":
        return 0.0
    billable = max(0, days_late - GRACE_DAYS)
    return min(billable * RATE_PER_DAY, CAP)
