import sys

import argparse

from mediahub import index, quota, settings


def human(size):
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def main(argv=None):
    parser = argparse.ArgumentParser(prog="stats")
    parser.add_argument("--over-quota", action="store_true")
    args = parser.parse_args(argv)
    config = settings.load()
    if args.over_quota:
        for owner, used in quota.over(index.read(config.index), config.quota_mb):
            print(f"{owner}\t{human(used)}\tquota {config.quota_mb} MB")
        return 0
    per_owner = {}
    for upload in index.read(config.index):
        count, size = per_owner.get(upload.owner, (0, 0))
        per_owner[upload.owner] = (count + 1, size + upload.size)
    for owner, (count, size) in sorted(per_owner.items()):
        print(f"{owner}\t{count}\t{human(size)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
