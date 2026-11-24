import argparse
import sys

from mediahub import dates, index, policy, report, settings


def main(argv=None):
    parser = argparse.ArgumentParser(prog="cleanup")
    parser.add_argument("--today", required=True, help="YYYY-MM-DD")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--owner", help="only this owner's uploads")
    args = parser.parse_args(argv)
    config = settings.load()
    today = dates.parse(args.today)
    uploads = index.read(config.index)
    candidates = [u for u in uploads if args.owner in (None, u.owner)]
    doomed = policy.expired(candidates, today, config.retention_days)[: config.max_batch]
    if args.apply:
        index.write(config.index, [u for u in uploads if u not in doomed])
    print(report.render(doomed, config, args.apply), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
