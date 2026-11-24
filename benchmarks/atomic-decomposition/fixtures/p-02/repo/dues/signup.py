from dues import billing, dates, plans
from dues.members import Member

FIRST_PAID_UNTIL = "2026-03-31"


def join(roster, ledger, name, plan_name):
    plan = plans.get(plan_name)
    name = " ".join(name.split())
    if not name:
        raise ValueError("a member needs a name")
    member = roster.add(Member(roster.next_id(), name, plan.name, FIRST_PAID_UNTIL, "2099-12"))
    dates.parse(member.paid_until)
    billing.charge(member, plan.price_cents + plans.JOINING_FEE_CENTS, "joining", ledger)
    return member
