#!/usr/bin/env python3
"""Grade rewrites of real skill prose under the original and the current pattern list.

Usage:
  grade_real.py CASES OUTDIR [--split dev|test|gate|all]
      Grades OUTDIR/<id>.md against each case. Prints one JSON record per case.
      Exit 0 when every output is valid, 3 when any is missing, empty or not a rewrite.
  grade_real.py --self-test
      Checks cases.json and the hand-written dev rewrites in dev/. Exit 0 on pass.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from grade import (MAX_RESIDUAL_HITS, MIN_OVERLAP, PHRASES, RATIO_MAX, RATIO_MIN,  # noqa: E402
                   content_overlap, count_patterns, fact_form, normalize, word_count)

CLEAN_RATIO_MIN = 0.85
CURRENT_ONLY = {"p13", "p14", "p15", "p23", "p27"}
NOT_JUST = re.compile(r"\b(?:not|isn't|aren't|wasn't) (?:just|only|merely)\b", re.I)
TRAILING_CONTRAST = re.compile(r"\b(?:it's|it is|this is|that's|that is)\s+[^.,;:!?\n]{1,40},"
                               r"\s+not\s+[^.,;:!?\n]{1,30}[.!]", re.I)
FENCED = re.compile(r"^\s*(```|~~~).*?^\s*\1[^\n]*$", re.M | re.S)
INLINE_CODE = re.compile(r"`[^`\n]+`")
LISTS = ("original", "current")


def prose(text):
    return INLINE_CODE.sub("CODE", FENCED.sub("", text))


def hits(text, facts):
    current = count_patterns(prose(text), facts)
    original = {p: n for p, n in current.items() if p not in CURRENT_ONLY}
    original["p09"] = len(NOT_JUST.findall(normalize(prose(text))))
    return {"original": original, "current": current}


def rule_kept(rule, form):
    return any(re.search(rx, form, re.I) for rx in rule["patterns"])


def grade(case, rewrite):
    record = {"id": case["id"], "split": case["split"], "gate": case.get("gate")}
    if rewrite is None or not rewrite.strip():
        return dict(record, valid=False, invalid_reason="missing" if rewrite is None else "empty",
                    success={name: False for name in LISTS})
    overlap = content_overlap(case["text"], rewrite)
    if overlap < MIN_OVERLAP:
        return dict(record, valid=False, invalid_reason="not a rewrite", overlap=round(overlap, 3),
                    success={name: False for name in LISTS})
    form = fact_form(rewrite)
    facts_missing = [f for f in case["facts"] if fact_form(f) not in form]
    rules_missing = [r["id"] for r in case["rules"] if not rule_kept(r, form)]
    ratio = word_count(rewrite) / word_count(case["text"])
    ratio_min = CLEAN_RATIO_MIN if case.get("gate") == "clean" else RATIO_MIN
    after = hits(rewrite, case["facts"])
    kept = not facts_missing and not rules_missing and ratio_min <= ratio <= RATIO_MAX
    return dict(record, valid=True, overlap=round(overlap, 3), length_ratio=round(ratio, 3),
                facts_kept=not facts_missing, facts_missing=facts_missing,
                rules_kept=not rules_missing, rules_missing=rules_missing,
                hits_source=hits(case["text"], case["facts"]), hits_rewrite=after,
                residual={name: sum(after[name].values()) for name in LISTS},
                success={name: kept and sum(after[name].values()) <= MAX_RESIDUAL_HITS
                         for name in LISTS})


def load_cases(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))["cases"]


def read_rewrite(directory, cid):
    path = Path(directory) / f"{cid}.md"
    return path.read_text(encoding="utf-8") if path.is_file() else None


def run(cases_path, out_dir, split):
    cases = [c for c in load_cases(cases_path) if split == "all" or c["split"] == split]
    records = [grade(c, read_rewrite(out_dir, c["id"])) for c in cases]
    for record in records:
        print(json.dumps(record, sort_keys=True))
    return 3 if any(not r["valid"] for r in records) else 0


def self_test(cases_path=HERE / "cases.json", dev_dir=HERE / "dev"):
    failures = []

    def check(condition, message):
        if not condition:
            failures.append(message)

    probe = "Use it. This is a plan, not a promise. It is not just text."
    check(len(PHRASES["p09"].findall(probe)) == len(NOT_JUST.findall(probe))
          + len(TRAILING_CONTRAST.findall(probe)), "p09 split differs from grade.py")
    cases = load_cases(cases_path)
    ids = [c["id"] for c in cases]
    check(len(ids) == len(set(ids)), "duplicate case ids")
    for c in cases:
        form = fact_form(c["text"])
        check(c["rules"], f"{c['id']}: no rules")
        for fact in c["facts"]:
            check(fact_form(fact) in form, f"{c['id']}: fact not in source: {fact}")
        for rule in c["rules"]:
            check(rule_kept(rule, form), f"{c['id']}: rule {rule['id']} misses source")
        source = grade(c, c["text"])
        check(source["facts_kept"] and source["rules_kept"], f"{c['id']}: source fails keys")
        dropped = rule_dropped(c)
        if dropped is not None:
            check(not grade(c, dropped)["rules_kept"], f"{c['id']}: deleting a rule passes")

    expected = {"good": True, "alt": True, "bad": False, "ruledrop": False}
    for kind, should_pass in expected.items():
        for c in (c for c in cases if c["split"] == "dev"):
            record = grade(c, read_rewrite(dev_dir / kind, c["id"]))
            check(record["valid"], f"dev/{kind}/{c['id']}: invalid")
            if not record["valid"]:
                continue
            check(all(ok == should_pass for ok in record["success"].values()),
                  f"dev/{kind}/{c['id']}: success {record['success']}, expected {should_pass}")
            if kind == "bad":
                check(record["facts_kept"] and record["rules_kept"],
                      f"dev/bad/{c['id']}: should fail on hits only")
            if kind == "ruledrop":
                check(not record["rules_kept"], f"dev/ruledrop/{c['id']}: no rule dropped")
    for message in failures:
        print("FAIL:", message)
    print(json.dumps({"self_test": "pass" if not failures else "fail", "failures": len(failures)}))
    return 0 if not failures else 1


def rule_dropped(case):
    """Delete every sentence that matches the first rule; None if nothing would remain."""
    rule = case["rules"][0]
    sentences = re.split(r"(?<=[.!?])\s+|\n+", case["text"])
    kept = [s for s in sentences if not rule_kept(rule, fact_form(s))]
    return "\n".join(kept) if kept and len(kept) < len(sentences) else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cases", nargs="?")
    parser.add_argument("out_dir", nargs="?")
    parser.add_argument("--split", choices=["dev", "test", "gate", "all"], default="all")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.cases or not args.out_dir:
        parser.print_usage(sys.stderr)
        return 1
    return run(args.cases, args.out_dir, args.split)


if __name__ == "__main__":
    sys.exit(main())
