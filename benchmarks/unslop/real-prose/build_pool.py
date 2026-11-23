#!/usr/bin/env python3
"""Cut this repo's skill prose into passages and draw the frozen splits.

Usage:
  build_pool.py --rung 1|2 [--exclude-files FILE ...] [--gate] [--key KEY.json ...] > cases.json
      Prints the pool size and the seeded draw for one rung as JSON. Each --key file
      ({"cases": [{"id", "facts", "rules"}]}) adds the authored answer key to its cases.
      --exclude-files drops source files already used (for example the
      dev files of an earlier calibration attempt). --gate also draws the
      gate split from the files the dev and test draws left unused.

Sources are read from git at COMMIT, never from the working tree.
"""
import argparse
import json
import random
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
from grade_real import FENCED, TRAILING_CONTRAST, hits, normalize, prose  # noqa: E402

COMMIT = "4a01f8d"
SEED = 347
RUNGS = {1: (120, 250), 2: (300, 450)}
DEV_N = 8
TEST_N = 30
GATE_CLEAN_N = 6
GATE_PATTERN_N = 2
GATE_PATTERNS = ["p09", "p13", "p15", "p23", "p27"]
EXCLUDED_DIRS = ("unslop/", "benchmarks/", ".claude/")
EXCLUDED_NAMES = {"NOTICE.md"}

HEADING = re.compile(r"^#{1,6}\s")
FENCE = re.compile(r"^\s*(```|~~~)")
ITEM = re.compile(r"^(?:[-*+]|\d+[.)])\s")
FACT_PATTERNS = [
    re.compile(r"`([^`\n]+)`"),
    re.compile(r"(?<![\w.-])(?:~|\.{1,2})?[\w.-]*/[\w./<>*-]+"),
    re.compile(r"(?<![\w-])--?[a-zA-Z][\w-]*"),
    re.compile(r"\b\d+(?:[.,:]\d+)*(?:\s?(?:%|percent|ms|s|seconds?|minutes?|hours?|days?|"
               r"weeks?|KB|MB|GB|tokens?|words?|lines?|files?|chars?|characters?|rounds?|"
               r"times|agents?|cases?|trials?)\b)?"),
]


def git(*args):
    return subprocess.run(["git", "-C", str(HERE), *args], check=True,
                          capture_output=True, text=True, encoding="utf-8").stdout


def source_files():
    paths = git("ls-tree", "-r", "--full-tree", "--name-only", COMMIT).splitlines()
    skill_dirs = {p.rsplit("/", 1)[0] + "/" for p in paths if p.endswith("/SKILL.md")}
    chosen = []
    for p in paths:
        if not p.endswith(".md") or p.startswith(EXCLUDED_DIRS):
            continue
        if p.rsplit("/", 1)[-1] in EXCLUDED_NAMES:
            continue
        if p == "README.md" or any(p.startswith(d) for d in skill_dirs):
            chosen.append(p)
    return sorted(chosen)


def strip_front_matter(lines):
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return i + 1
    return 0


def units(lines, start):
    """Split lines into (first, last_exclusive, kind, words) units."""
    out = []
    i = start
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if FENCE.match(line):
            j = i + 1
            while j < len(lines) and not FENCE.match(lines[j]):
                j += 1
            out.append((i, min(j + 1, len(lines)), "code", 0))
            i = j + 1
            continue
        if HEADING.match(line):
            out.append((i, i + 1, "heading", len(line.split()) - 1))
            i += 1
            continue
        j = i + 1
        while (j < len(lines) and lines[j].strip() and not HEADING.match(lines[j])
               and not FENCE.match(lines[j]) and not ITEM.match(lines[j])):
            j += 1
        out.append((i, j, "text", sum(len(ln.split()) for ln in lines[i:j])))
        i = j
    return out


def sections(us):
    current = []
    for u in us:
        if u[2] == "heading" and current:
            yield current
            current = []
        current.append(u)
    if current:
        yield current


def runs(section, low, high):
    total = sum(u[3] for u in section)
    if low <= total <= high:
        yield section
        return
    i = 0
    while i < len(section):
        if section[i][2] == "code":
            i += 1
            continue
        j, words = i, 0
        while j < len(section) and words < low:
            words += section[j][3]
            j += 1
        if low <= words <= high:
            yield section[i:j]
            i = j
        else:
            i += 1


def pool(rung):
    low, high = RUNGS[rung]
    passages = []
    for path in source_files():
        lines = git("show", f"{COMMIT}:{path}").splitlines()
        for run in (r for s in sections(units(lines, strip_front_matter(lines)))
                    for r in runs(s, low, high)):
            first, last = run[0][0], run[-1][1]
            text = "\n".join(lines[first:last]).strip("\n") + "\n"
            current = hits(text, [])["current"]
            prose_only = FENCED.sub("", text)
            candidates = []
            for rx in FACT_PATTERNS:
                for m in rx.finditer(prose_only):
                    fact = (m.group(1) if rx.groups else m.group(0)).strip()
                    if fact and fact not in candidates:
                        candidates.append(fact)
            passages.append({"source": path, "lines": [first + 1, last],
                             "words": sum(u[3] for u in run), "text": text,
                             "union_hits": sum(current.values()),
                             "patterns": sorted(p for p, n in current.items() if n),
                             "trailing_contrast": bool(TRAILING_CONTRAST.search(
                                 normalize(prose(text)))),
                             "candidate_facts": candidates})
    return passages


def take(order, n, used):
    picked = []
    for p in order:
        if len(picked) == n:
            break
        if p["source"] not in used:
            picked.append(p)
            used.add(p["source"])
    return picked


def draw(rung, exclude_files=(), gate=False):
    everything = pool(rung)
    rng = random.Random(SEED)
    used = set(exclude_files)
    hit_bearing = [p for p in everything if p["union_hits"] >= 2]
    order = rng.sample(hit_bearing, len(hit_bearing))
    splits = {"dev": take(order, DEV_N, used)}
    splits["test"] = take(order, TEST_N, used)
    if gate:
        gate_pool = pool(1)
        clean = [p for p in gate_pool if p["union_hits"] == 0]
        splits["gate"] = [dict(p, gate="clean")
                          for p in take(rng.sample(clean, len(clean)), GATE_CLEAN_N, used)]
        for pid in GATE_PATTERNS:
            shown = [p for p in gate_pool if pid in p["patterns"]]
            splits["gate"] += [dict(p, gate=pid) for p in
                               take(rng.sample(shown, len(shown)), GATE_PATTERN_N, used)]
    prefix = {"dev": "d", "test": "t", "gate": "g"}
    for split, chosen in splits.items():
        for k, p in enumerate(chosen, 1):
            p.update(id=f"r{rung}{prefix[split]}{k:02d}", split=split, rung=rung)
    return {"commit": COMMIT, "seed": SEED, "rung": rung, "word_band": RUNGS[rung],
            "pool_size": len(everything), "hit_bearing": len(hit_bearing),
            "source_files": len(source_files()), "excluded_files": sorted(exclude_files),
            "cases": [p for chosen in splits.values() for p in chosen]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rung", type=int, choices=sorted(RUNGS), required=True)
    parser.add_argument("--exclude-files", nargs="*", default=[])
    parser.add_argument("--gate", action="store_true")
    parser.add_argument("--key", nargs="*", default=[])
    args = parser.parse_args(argv)
    result = draw(args.rung, args.exclude_files, args.gate)
    keys = {k["id"]: k for path in args.key
            for k in json.loads(Path(path).read_text(encoding="utf-8"))["cases"]}
    for case in result["cases"]:
        if case["id"] in keys:
            case.update(facts=keys[case["id"]]["facts"], rules=keys[case["id"]]["rules"])
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
