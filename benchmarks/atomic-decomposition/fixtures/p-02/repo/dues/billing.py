from dues import plans


class BillingError(ValueError):
    pass


def charge(member, amount_cents, reason, ledger):
    if amount_cents <= 0:
        raise BillingError(f"charge must be positive, got {amount_cents}")
    return ledger.add(member.id, "charge", amount_cents, reason)


def refund(member, amount_cents, reason, ledger):
    if amount_cents <= 0:
        raise BillingError(f"refund must be positive, got {amount_cents}")
    if amount_cents > ledger.balance(member.id) and ledger.for_member(member.id):
        raise BillingError("refund larger than the member's balance")
    return ledger.add(member.id, "refund", amount_cents, reason)


def guest_pass(member, ledger):
    if member.overdue:
        raise BillingError(f"{member.id} is overdue and cannot buy guest passes")
    return charge(member, plans.GUEST_PASS_CENTS, "guest pass", ledger)


def remind(member, text, ledger):
    return f"to {member.name}: {text}"
