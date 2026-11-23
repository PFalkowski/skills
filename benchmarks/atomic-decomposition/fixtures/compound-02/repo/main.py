import sys

from reader import summarize
from summary import Summary


def main(paths):
    total = Summary()
    for path in paths:
        total.merge(summarize(path))
    print("requests", total.count)
    print("classes", sorted(total.classes.items()))
    print("buckets", sorted(total.buckets.items()))
    print("slowest", total.slowest)
    print("mean", round(total.mean_ms, 2))


if __name__ == "__main__":
    main(sys.argv[1:])
