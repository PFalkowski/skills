#!/usr/bin/env python3
"""Frozen decision rule for the unslop A-B suite (see EXPERIMENT.md).

Usage:
  analyze.py A.jsonl B.jsonl CONTROL.jsonl
      Each file is the stdout of `grade.py passages.json <dir> --split test`.
      Prints one JSON report. Exit codes follow compare-prompts' score.py:
      0 improvement or no meaningful change, 1 regression,
      2 inconclusive (including ceiling and failed sensitivity), 3 invalid.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "compare-prompts" / "scripts"))
from score import paired_interval  # noqa: E402

N_EXPECTED = 20
ALPHA = 0.05
MARGIN = 0.20
QUALITY_FLOOR = 0.70
SENSITIVITY_GAP = 0.30
PATTERN_LOSS_MIN = 2


def load(path):
    records = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()
               if line.strip()]
    return {r["id"]: r for r in records if r.get("type") == "passage"}


def residual_passages(arm, pattern):
    return sum(1 for r in arm.values() if r["valid"] and r["hits_rewrite"][pattern] > 0)


def decide(a, b, control):
    report = {"margin": MARGIN, "alpha": ALPHA, "quality_floor": QUALITY_FLOOR,
              "sensitivity_gap": SENSITIVITY_GAP}
    ids = set(a)
    problems = []
    for name, arm in (("a", a), ("b", b), ("control", control)):
        if len(arm) != N_EXPECTED or set(arm) != ids:
            problems.append(f"{name}: expected the same {N_EXPECTED} passage ids")
        problems += [f"{name}/{pid}: {r['invalid_reason']}" for pid, r in arm.items()
                     if not r["valid"]]
    if problems:
        return dict(report, verdict="INVALID", problems=problems), 3

    rate = {name: sum(r["success"] for r in arm.values()) / N_EXPECTED
            for name, arm in (("a", a), ("b", b), ("control", control))}
    wins = sum(b[i]["success"] and not a[i]["success"] for i in ids)
    losses = sum(a[i]["success"] and not b[i]["success"] for i in ids)
    low, high = paired_interval(wins, losses, N_EXPECTED, ALPHA)
    fact_regressions = sorted(i for i in ids if a[i]["facts_kept"] and not b[i]["facts_kept"])
    patterns = a[next(iter(ids))]["hits_rewrite"]
    lost = sorted(p for p in patterns if residual_passages(a, p) == 0
                  and residual_passages(b, p) >= PATTERN_LOSS_MIN)
    report.update(
        success_rate=rate, b_only=wins, a_only=losses,
        paired_effect=(wins - losses) / N_EXPECTED, interval=[low, high],
        residual_hits_total={name: sum(r["residual_hits"] for r in arm.values())
                             for name, arm in (("a", a), ("b", b), ("control", control))},
        residual_passages_by_pattern={p: {"a": residual_passages(a, p),
                                          "b": residual_passages(b, p),
                                          "control": residual_passages(control, p)}
                                      for p in patterns},
        critical_fact_regressions=fact_regressions, critical_pattern_losses=lost,
        shared_failures=sorted(i for i in ids if not a[i]["success"] and not b[i]["success"]),
    )

    if fact_regressions or lost:
        return dict(report, verdict="REGRESSION", reason="critical gate"), 1
    if rate["a"] - rate["control"] < SENSITIVITY_GAP:
        return dict(report, verdict="INCONCLUSIVE", reason="suite not sensitive: control "
                    "within the sensitivity gap of arm A"), 2
    if rate["a"] == 1.0 and rate["b"] == 1.0:
        return dict(report, verdict="INCONCLUSIVE", reason="ceiling: both arms at 100 percent; "
                    "this is not evidence of equivalence"), 2
    floor_ok = rate["b"] >= QUALITY_FLOOR
    if low > MARGIN and floor_ok:
        return dict(report, verdict="IMPROVEMENT"), 0
    if high < -MARGIN:
        return dict(report, verdict="REGRESSION", reason="interval below -margin"), 1
    if -MARGIN <= low and high <= MARGIN and floor_ok:
        return dict(report, verdict="NO_MEANINGFUL_CHANGE"), 0
    reason = "arm B below quality floor" if not floor_ok else "interval crosses the margin"
    return dict(report, verdict="INCONCLUSIVE", reason=reason), 2


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 3
    report, code = decide(*(load(p) for p in argv))
    print(json.dumps(report, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
