#!/usr/bin/env python3
"""Mechanical grader for the unslop A-B suite. Python 3 standard library only.

Usage:
  grade.py PASSAGES OUTDIR [--split test|dev|all]
      Grades OUTDIR/<id>.md against each passage. Prints one JSON record per
      passage, then one summary record. Exit 0 when every output is valid,
      3 when any output is missing, empty or not a rewrite, 1 or 2 on usage errors.
  grade.py --self-test
      Validates passages.json and the hand-written dev rewrites in dev/.
      Exit 0 on pass, 1 on failure.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Frozen success rule. Chosen on the dev split only; see README.md and EXPERIMENT.md.
MAX_RESIDUAL_HITS = 1
RATIO_MIN = 0.45
RATIO_MAX = 1.25
MIN_OVERLAP = 0.15

CURLY = {"‘": "'", "’": "'", "“": '"', "”": '"', " ": " "}
SMALL_WORDS = {
    "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at",
    "by", "in", "of", "on", "to", "up", "via", "vs", "with", "from", "into", "is",
    "it", "its", "be",
}


def normalize(text):
    for src, dst in CURLY.items():
        text = text.replace(src, dst)
    return text


def words_re(*alternatives):
    return re.compile(r"\b(?:" + "|".join(alternatives) + r")\b", re.I)


PHRASES = {
    "p01": words_re(r"pivotal moment", r"testament to", r"evolving landscape",
                    r"(?:set|sets|setting) the stage for", r"indelible mark",
                    r"deeply rooted"),
    "p03": re.compile(r",\s+(?:highlighting|ensuring|reflecting|showcasing|fostering)\b",
                      re.I),
    "p04": words_re(r"nestled", r"vibrant", r"breathtaking", r"groundbreaking",
                    r"renowned", r"stunning", r"must-visit"),
    "p05": words_re(r"(?:experts|industry reports|some critics)\s+"
                    r"(?:believe|suggest|argue|say|agree)"),
    "p06": words_re(r"despite (?:[\w'-]+\s+){0,3}challenges", r"continues? to thrive"),
    "p07": words_re(r"additionally", r"crucial(?:ly)?", r"delv(?:e|es|ed|ing)",
                    r"enduring", r"enhanc(?:e|es|ed|ing|ement)", r"foster(?:s|ed|ing)?",
                    r"garner(?:s|ed|ing)?", r"interplay", r"intricate", r"landscapes?",
                    r"pivotal", r"showcas(?:e|es|ed|ing)", r"tapestry", r"testament",
                    r"underscor(?:e|es|ed|ing)", r"vibrant"),
    "p08": words_re(r"(?:serve|serves|served|serving) as", r"(?:stand|stands|standing) as",
                    r"boasts?", r"boasting"),
    "p09": re.compile(
        r"\b(?:not|isn't|aren't|wasn't) (?:just|only|merely)\b"
        r"|\b(?:it's|it is|this is|that's|that is)\s+[^.,;:!?\n]{1,40},\s+not\s+"
        r"[^.,;:!?\n]{1,30}[.!]", re.I),
    "p13": words_re(r"load[- ]bearing", r"earns? (?:its|their) keep",
                    r"carr(?:y|ies|ied|ying) the argument"),
    "p14": words_re(r"worth noting", r"this matters", r"here's the (?:part|thing)",
                    r"the trap is", r"full stop"),
    "p15": words_re(r"(?:the )?honest answer", r"honestly", r"frankly",
                    r"to be (?:honest|frank)"),
    "p24": re.compile(r"\b(?:I )?hope this helps\b|\blet me know if\b|\bof course!"
                      r"|\bcertainly!", re.I),
    "p25": words_re(r"while (?:specific |exact )?details (?:are|remain) (?:limited|scarce)",
                    r"as of my (?:last|knowledge)",
                    r"based on (?:the )?available information"),
    "p26": words_re(r"great question", r"you're absolutely right",
                    r"excellent (?:question|point)"),
    "p27": re.compile(r"\bI'll now\b|\bI will now\b|\bnext,? I'll\b|\blet me (?!know\b)",
                      re.I),
    "p28": words_re(r"in order to", r"due to the fact that",
                    r"it(?:'s| is) important to note that"),
    "p29": words_re(r"(?:could|may|might|can) (?:potentially|possibly)",
                    r"(?:could|might|may) be argued"),
    "p30": words_re(r"future (?:looks|is) bright", r"exciting times (?:lie )?ahead",
                    r"(?:just|only) the beginning", r"the best is yet to come"),
}

COLON = re.compile(
    r"(?:^|[.!?]\s+)(?i:if|when|because|since|instead of|put simply|in short"
    r"|in other words|the (?:result|upshot|fix|catch|point|reason|answer|short version"
    r"|bottom line|good news|bad news|takeaway)|here's (?:the|what|why|how))\b"
    r"(?:[^:.\n]|\.(?=\S)){0,80}: [a-z]", re.M)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️]")
BOLD = re.compile(r"\*\*[^*\n]+?\*\*|__[^_\n]+?__")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
INLINE_HEADER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*[^*\n]+?(?::\*\*|\*\*\s*:)"
                           r"|__[^_\n]+?(?::__|__\s*:))", re.M)
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$", re.M)
TRIAD = re.compile(r"\b[\w'-]+(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? (?:and|or) [\w'-]+")

PATTERNS = sorted(list(PHRASES) + ["p16", "p17", "p18", "p19", "p20", "p21", "p22", "p23"])
NOT_MEASURED = ["p02", "p10", "p11", "p12"]


def prose_lines(text):
    return [ln for ln in text.splitlines()
            if not HEADING.match(ln) and not ln.lstrip().startswith(("```", "|"))]


def proper_words(text, facts):
    found = set()
    for fact in facts:
        found.update(w for w in re.findall(r"[A-Za-z][\w'-]*", fact) if w[0].isupper())
    for line in prose_lines(text):
        line = LIST_ITEM.sub("", line).replace("*", "")
        for sentence in re.split(r"(?<=[.!?])\s+", line):
            for w in re.findall(r"[A-Za-z][\w'-]*", sentence)[1:]:
                if w[0].isupper():
                    found.add(w)
    return found


def title_case_headings(text, proper):
    hits = 0
    for heading in HEADING.findall(text):
        words = re.findall(r"[A-Za-z][\w'-]*", heading)[1:]
        candidates = [w for w in words if w.lower() not in SMALL_WORDS
                      and w not in proper and not w.isupper()]
        if candidates and all(w[0].isupper() for w in candidates):
            hits += 1
    return hits


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def punchy_paragraphs(text):
    hits = 0
    for para in paragraphs(text):
        first = para.splitlines()[0]
        if HEADING.match(first) or LIST_ITEM.match(first) or first.startswith(("```", "|")):
            continue
        if para.endswith(":"):
            continue
        if len(para.split()) < 8:
            hits += 1
    return hits


def bold_outside_lead_ins(text):
    hits = 0
    for line in prose_lines(text):
        spans = BOLD.findall(line)
        if spans and INLINE_HEADER.match(line):
            spans = spans[1:]
        hits += len(spans)
    return hits


def count_patterns(raw, facts):
    text = normalize(raw)
    counts = {pid: len(rx.findall(text)) for pid, rx in PHRASES.items()}
    counts["p16"] = text.count("—") + len(re.findall(r"\s(?:–|--)\s", text))
    counts["p17"] = len(COLON.findall(text))
    counts["p18"] = bold_outside_lead_ins(text)
    counts["p19"] = len(INLINE_HEADER.findall(text))
    counts["p20"] = title_case_headings(text, proper_words(text, facts))
    counts["p21"] = len(EMOJI.findall(text))
    counts["p22"] = sum(raw.count(c) for c in "‘’“”")
    counts["p23"] = punchy_paragraphs(text)
    return {pid: counts[pid] for pid in PATTERNS}


def fact_form(text):
    text = normalize(text).replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", text)


def word_count(text):
    return len(text.split())


def content_overlap(original, rewrite):
    source = set(re.findall(r"[a-z]{5,}", original.lower()))
    target = set(re.findall(r"[a-z]{5,}", rewrite.lower()))
    return len(source & target) / len(source) if source else 1.0


def grade(passage, rewrite):
    record = {"type": "passage", "id": passage["id"], "split": passage["split"]}
    if rewrite is None or not rewrite.strip():
        record.update(valid=False, invalid_reason="missing" if rewrite is None else "empty",
                      success=False)
        return record
    overlap = content_overlap(passage["text"], rewrite)
    if overlap < MIN_OVERLAP:
        record.update(valid=False, invalid_reason="not a rewrite", overlap=round(overlap, 3),
                      success=False)
        return record
    before = count_patterns(passage["text"], passage["facts"])
    after = count_patterns(rewrite, passage["facts"])
    form = fact_form(rewrite)
    missing = [f for f in passage["facts"] if fact_form(f) not in form]
    ratio = word_count(rewrite) / word_count(passage["text"])
    residual = sum(after.values())
    record.update(
        valid=True,
        hits_original=before,
        hits_rewrite=after,
        residual_hits=residual,
        facts_kept=not missing,
        facts_missing=missing,
        length_ratio=round(ratio, 3),
        overlap=round(overlap, 3),
        triads_original=len(TRIAD.findall(normalize(passage["text"]))),
        triads_rewrite=len(TRIAD.findall(normalize(rewrite))),
        success=residual <= MAX_RESIDUAL_HITS and not missing
        and RATIO_MIN <= ratio <= RATIO_MAX,
    )
    return record


def load_passages(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))["passages"]


def read_rewrite(directory, pid):
    path = Path(directory) / f"{pid}.md"
    return path.read_text(encoding="utf-8") if path.is_file() else None


def run(passages_path, out_dir, split):
    passages = [p for p in load_passages(passages_path) if split == "all" or p["split"] == split]
    records = [grade(p, read_rewrite(out_dir, p["id"])) for p in passages]
    for record in records:
        print(json.dumps(record, sort_keys=True))
    invalid = [r["id"] for r in records if not r["valid"]]
    print(json.dumps({"type": "summary", "split": split, "n": len(records),
                      "successes": sum(r["success"] for r in records),
                      "invalid": invalid,
                      "rule": {"max_residual_hits": MAX_RESIDUAL_HITS,
                               "ratio_band": [RATIO_MIN, RATIO_MAX]}}, sort_keys=True))
    return 3 if invalid else 0


def self_test():
    failures = []

    def check(condition, message):
        if not condition:
            failures.append(message)

    passages = load_passages(HERE / "passages.json")
    ids = [p["id"] for p in passages]
    check(len(ids) == len(set(ids)), "duplicate passage ids")
    test = [p for p in passages if p["split"] == "test"]
    dev = [p for p in passages if p["split"] == "dev"]
    check(len(test) == 20 and len(dev) == 4, f"expected 20 test and 4 dev, got {len(test)}/{len(dev)}")
    for p in passages:
        n = word_count(p["text"])
        check(120 <= n <= 200, f"{p['id']}: {n} words, outside 120-200")
        check(4 <= len(p["facts"]) <= 6, f"{p['id']}: {len(p['facts'])} facts")
        for fact in p["facts"]:
            check(fact_form(fact) in fact_form(p["text"]), f"{p['id']}: fact not in text: {fact}")
        counts = count_patterns(p["text"], p["facts"])
        seeded = {f"p{n:02d}" for n in p["seeded"]}
        for pid, count in counts.items():
            if pid in seeded:
                check(count > 0, f"{p['id']}: seeded {pid} not detected")
            else:
                check(count == 0, f"{p['id']}: {pid} detected {count}x but not seeded")
    for number in range(1, 31):
        times = sum(number in p["seeded"] for p in test)
        check(times >= 2, f"pattern {number} seeded in only {times} test passages")

    expectations = {"good": True, "alt": True, "bad": False, "factdrop": False}
    for kind, should_pass in expectations.items():
        for p in dev:
            rewrite = read_rewrite(HERE / "dev" / kind, p["id"])
            record = grade(p, rewrite)
            check(record["valid"], f"dev/{kind}/{p['id']}: invalid ({record.get('invalid_reason')})")
            if not record["valid"]:
                continue
            check(record["success"] == should_pass,
                  f"dev/{kind}/{p['id']}: success={record['success']}, expected {should_pass}")
            if kind == "bad":
                check(record["facts_kept"], f"dev/bad/{p['id']}: should fail on hits, not facts")
            if kind == "factdrop":
                check(not record["facts_kept"], f"dev/factdrop/{p['id']}: no fact dropped")
            print(json.dumps({"kind": kind, "id": p["id"], "success": record["success"],
                              "residual_hits": record["residual_hits"],
                              "facts_missing": record["facts_missing"],
                              "length_ratio": record["length_ratio"],
                              "overlap": record["overlap"]}))

    check(grade(dev[0], None)["invalid_reason"] == "missing", "missing file not invalid")
    check(grade(dev[0], "  \n")["invalid_reason"] == "empty", "empty file not invalid")
    check(grade(dev[0], "Sure, here you go. Nothing else.")["invalid_reason"] == "not a rewrite",
          "unrelated text not invalid")
    check(fact_form("“x”  y") == '"x" y', "quote/whitespace normalisation")

    for message in failures:
        print("FAIL:", message)
    print(json.dumps({"self_test": "pass" if not failures else "fail",
                      "failures": len(failures)}))
    return 0 if not failures else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("passages", nargs="?")
    parser.add_argument("out_dir", nargs="?")
    parser.add_argument("--split", choices=["test", "dev", "all"], default="test")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.passages or not args.out_dir:
        parser.print_usage(sys.stderr)
        return 1
    return run(args.passages, args.out_dir, args.split)


if __name__ == "__main__":
    sys.exit(main())
