import argparse
import sys

from ship import commands, rates
from ship.store import Store


def build_parser():
    parser = argparse.ArgumentParser(prog="shipctl")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    p = sub.add_parser("show")
    p.add_argument("id")
    p = sub.add_parser("create")
    p.add_argument("recipient")
    p.add_argument("address")
    p.add_argument("postcode")
    p.add_argument("--weight", type=float, required=True)
    p = sub.add_parser("label")
    p.add_argument("id")
    p.add_argument("--service", default="standard", choices=rates.SERVICES)
    p = sub.add_parser("address")
    p.add_argument("id")
    p.add_argument("address")
    p.add_argument("postcode")
    p = sub.add_parser("amend")
    p.add_argument("path")
    p = sub.add_parser("edit")
    p.add_argument("id")
    p.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    p = sub.add_parser("relabel")
    p.add_argument("id")
    p.add_argument("--service", choices=rates.SERVICES)
    p = sub.add_parser("track")
    p.add_argument("id")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    store = Store.open()
    try:
        lines = commands.run(store, args)
    except commands.CommandError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    store.save()
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
