import argparse
import sys

from listkeeper import backup, exporter, importer
from listkeeper.store import Store, StoreError


def cmd_import(store, args):
    result = importer.import_file(store, args.path)
    return [f"added {result.added}, merged {result.merged}, rejected {result.rejected}"]


def cmd_add(store, args):
    subscriber = store.insert({"email": args.email, "name": args.name or "", "city": "",
                               "topics": []})
    return [f"added {subscriber['email']}"]


def cmd_list(store, args):
    return [f"{s['email']}\t{s['name']}\t{s['city']}\t{';'.join(s['topics'])}" for s in store.all()]


def cmd_export(store, args):
    count = exporter.write_csv(store.all(), args.path)
    return [f"exported {count} subscriber(s) to {args.path}"]


def cmd_backup(store, args):
    backup.write(store.all(), args.path)
    return [f"backed up {len(store.all())} subscriber(s)"]


def cmd_restore(store, args):
    rows = backup.read(args.path)
    store.clear()
    store.bulk_load(rows)
    return [f"restored {len(rows)} subscriber(s)"]


def cmd_remove(store, args):
    store.remove(args.email)
    return [f"removed {args.email}"]


def build_parser():
    parser = argparse.ArgumentParser(prog="lk")
    parser.add_argument("--store", default=None)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, func, params in [("import", cmd_import, ["path"]), ("add", cmd_add, ["email"]),
                               ("list", cmd_list, []), ("export", cmd_export, ["path"]),
                               ("backup", cmd_backup, ["path"]),
                               ("restore", cmd_restore, ["path"]),
                               ("remove", cmd_remove, ["email"])]:
        p = sub.add_parser(name)
        for param in params:
            p.add_argument(param)
        p.set_defaults(func=func)
        if name == "add":
            p.add_argument("--name")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    store = Store.open(args.store)
    try:
        lines = args.func(store, args)
    except (StoreError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    store.save()
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
