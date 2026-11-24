import argparse
import sys

from relay import config, digest, routing
from relay.channels import build
from relay.outbox import Outbox
from relay.templates import render


def shown(body):
    return body.replace("\n", "\\n")


def deliver(text, severity, at, outbox):
    settings = config.load_channels()
    for name in routing.channels_for(severity, at):
        build(name, settings[name], outbox).send(text)


def print_outbox(outbox):
    for d in outbox.items:
        print(f"{d.channel}\t{d.recipient}\t{shown(d.body)}")


def send(args, outbox):
    deliver(render(args.text, args.title), args.severity, args.at, outbox)
    print_outbox(outbox)


def batch(args, outbox):
    alerts = digest.read_alerts(args.path)
    for severity, text in digest.summarise(alerts):
        deliver(text, severity, args.at, outbox)
    print_outbox(outbox)


def show_channels(args, outbox):
    for name, entry in sorted(config.load_channels().items()):
        print(f"{name}\t{entry['recipient']}\tmax_length={entry['max_length']}")


def show_routes(args, outbox):
    for severity, names in routing.load_routes().items():
        print(f"{severity}\t{', '.join(names)}")


def check(args, outbox):
    problems = config.check(routing.load_routes())
    for problem in problems:
        print(problem)
    print("ok" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


def main(argv=None):
    parser = argparse.ArgumentParser(prog="relay")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("send")
    p.add_argument("--severity", default="normal", choices=routing.SEVERITIES)
    p.add_argument("--title")
    p.add_argument("--at", help="local time HH:MM, for quiet hours")
    p.add_argument("text")
    p.set_defaults(func=send)
    b = sub.add_parser("batch")
    b.add_argument("path")
    b.add_argument("--at", help="local time HH:MM, for quiet hours")
    b.set_defaults(func=batch)
    sub.add_parser("channels").set_defaults(func=show_channels)
    sub.add_parser("routes").set_defaults(func=show_routes)
    sub.add_parser("check").set_defaults(func=check)
    args = parser.parse_args(argv)
    return args.func(args, Outbox()) or 0


if __name__ == "__main__":
    sys.exit(main())
