"""Randomize the blind labels for a tier 2 review.

    python benchmarks/attention-rewrite/blind.py --candidate my-config [--with-y] --seed 7 --out mapping.json

Prints only the labels and the label order for each dimension. The mapping from label to
subject goes to --out; keep it away from reviewers and the judge until the verdict is written.
"""
import argparse
import json
import random
import sys
from pathlib import Path

DIMENSIONS = ["Correctness and parity", "ADR-0007 boundaries", "Security", "Tests", "Simplicity", "Docs and running"]


def assign(seed, with_y, candidate="candidate"):
    subjects = ["anchor-x", candidate] + (["anchor-y"] if with_y else [])
    labels = [chr(ord("A") + i) for i in range(len(subjects))]
    random.Random(seed).shuffle(subjects)
    return dict(zip(labels, subjects))


def orders(labels):
    """Label order per dimension. It is rotated so that every label is read first about equally often."""
    names = sorted(labels)
    return {dim: names[i % len(names):] + names[:i % len(names)] for i, dim in enumerate(DIMENSIONS)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--candidate", required=True, help="name of the candidate configuration")
    ap.add_argument("--with-y", action="store_true", help="also review anchor Y")
    ap.add_argument("--seed", type=int, required=True, help="record it so the draw can be repeated")
    ap.add_argument("--out", required=True, help="file for the secret mapping; it must not exist")
    args = ap.parse_args(argv)
    out = Path(args.out)
    if out.exists():
        print(f"blind refused: {out} already exists; a mapping is never overwritten", file=sys.stderr)
        return 2
    labels = assign(args.seed, args.with_y, args.candidate)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"seed": args.seed, "mapping": labels}, indent=1), encoding="utf-8")
    print("Labels:", ", ".join(sorted(labels)))
    print("Tell the judge, and only the judge, that anchor X is label", next(k for k, v in labels.items() if v == "anchor-x"))
    for dim, order in orders(labels).items():
        print(f"  {dim}: {' then '.join(order)}")
    print(f"Mapping written to {out}. Do not read it until the judge has finished.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
