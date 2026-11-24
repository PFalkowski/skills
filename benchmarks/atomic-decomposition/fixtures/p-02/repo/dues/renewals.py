from dues import billing, dates, plans

PERIOD_DAYS = 30


def prorated(price_cents, days):
    if not 1 <= days <= PERIOD_DAYS:
        raise ValueError(f"days must be 1 to {PERIOD_DAYS}, got {days}")
    return (price_cents * days + PERIOD_DAYS // 2) // PERIOD_DAYS


def renew(member, ledger, days=None):
    plan = plans.get(member.plan)
    amount = plan.price_cents if days is None else prorated(plan.price_cents, days)
    entry = billing.charge(member, amount, f"renewal {days or PERIOD_DAYS} days", ledger)
    member.paid_until = dates.month_end_after(member.paid_until)
    member.overdue = False
    return entry
