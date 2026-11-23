from fees import late_fee
from members import load

LOANS = [(1, 5), (2, 10), (3, 30), (1, 3)]

members = load()
for member_id, days_late in LOANS:
    member = members[member_id]
    print(member.name, days_late, "%.2f" % late_fee(member, days_late))
