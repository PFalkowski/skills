import argparse
import sys

from dues import billing, jobs, members, renewals, signup
from dues.ledger import Ledger
from dues.money import format_cents


def print_entries(entries):
    for entry in entries:
        print(f"{entry.member_id}\t{entry.kind}\t{format_cents(entry.amount_cents)}\t{entry.reason}")


def cmd_members(args, roster, ledger):
    for m in roster.all():
        flag = " overdue" if m.overdue else ""
        print(f"{m.id}\t{m.name}\t{m.plan}\tpaid until {m.paid_until}{flag}")


def cmd_signup(args, roster, ledger):
    signup.join(roster, ledger, args.name, args.plan)


def cmd_renew(args, roster, ledger):
    renewals.renew(roster.get(args.member), ledger, args.days)


def cmd_guest(args, roster, ledger):
    billing.guest_pass(roster.get(args.member), ledger)


def cmd_jobs(args, roster, ledger):
    for line in jobs.run_all(roster, ledger, args.day):
        print(line)


def cmd_ledger(args, roster, ledger):
    for m in roster.all():
        print(f"{m.id}\t{format_cents(ledger.balance(m.id))}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="dues")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("members").set_defaults(func=cmd_members)
    p = sub.add_parser("signup")
    p.add_argument("name")
    p.add_argument("plan")
    p.set_defaults(func=cmd_signup)
    p = sub.add_parser("renew")
    p.add_argument("member")
    p.add_argument("--days", type=int)
    p.set_defaults(func=cmd_renew)
    p = sub.add_parser("guest")
    p.add_argument("member")
    p.set_defaults(func=cmd_guest)
    p = sub.add_parser("jobs")
    p.add_argument("--day", type=int, default=1, help="day of the month, 1 to 28")
    p.set_defaults(func=cmd_jobs)
    sub.add_parser("ledger").set_defaults(func=cmd_ledger)
    args = parser.parse_args(argv)
    roster, ledger = members.load(), Ledger()
    args.func(args, roster, ledger)
    print_entries(ledger.entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
