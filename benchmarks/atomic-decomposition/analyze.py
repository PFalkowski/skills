#!/usr/bin/env python3
"""Frozen decision rule for the atomic-decomposition suite (see EXPERIMENT.md).

Usage:
  analyze.py RUN_DIR --calibrate
      RUN_DIR holds grades/a.jsonl for the dev split. Prints arm A's dev success rate
      and whether it meets the calibration target.
  analyze.py RUN_DIR
      RUN_DIR holds grades/a.jsonl and grades/b.jsonl for the test and gate splits and
      audit.json (harness.py grade). Prints one JSON report.
      Exit 0 improvement or no meaningful change, 1 regression, 2 inconclusive, 3 invalid.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "benchmark-skill" / "scripts"))
import grade as grader  # noqa: E402
from score import paired_interval  # noqa: E402

N_TEST = 24
ALPHA = 0.05
MARGIN = 0.20
CEILING_RATE = min(0.90, 1 - MARGIN)
FLOOR_RATE = MARGIN
QUALITY_FLOOR = 0.60
CALIBRATION = (0.20, 0.60)
ARMS = ("a", "b")
CHECKS = ("shape", "root", "evidence", "consistent", "ran")
CODES = {"IMPROVEMENT": 0, "NO_MEANINGFUL_CHANGE": 0, "REGRESSION": 1, "INCONCLUSIVE": 2,
         "INVALID": 3}


def load(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()
            if line.strip()]


def rate(arm, ids, key=lambda r: r["success"]):
    return round(sum(key(arm[i]) for i in ids) / len(ids), 4) if ids else None


def describe(arms, test, gate, kinds):
    a, b = arms["a"], arms["b"]
    usage_keys = sorted({k for arm in arms.values() for r in arm.values() for k in r["usage"]})
    return {
        "success_rate": {n: {"test": rate(arms[n], test), "gate": rate(arms[n], gate),
                             **{k: rate(arms[n], ids) for k, ids in kinds.items()}} for n in ARMS},
        "b_only": sorted(i for i in test if b[i]["success"] and not a[i]["success"]),
        "a_only": sorted(i for i in test if a[i]["success"] and not b[i]["success"]),
        "every_arm_passed": sorted(i for i in test if a[i]["success"] and b[i]["success"]),
        "every_arm_failed": sorted(i for i in test if not a[i]["success"] and not b[i]["success"]),
        "check_rate": {n: {c: rate(arms[n], test, lambda r, c=c: r["checks"][c]) for c in CHECKS}
                       for n in ARMS},
        "mean_atoms": {n: rate(arms[n], test + gate, lambda r: r["atoms"]) for n in ARMS},
        "cost_usd": {n: round(sum(r["cost_usd"] for r in arms[n].values()), 4) for n in ARMS},
        "tokens": {n: {k: sum(r["usage"].get(k, 0) for r in arms[n].values()) for k in usage_keys}
                   for n in ARMS},
        "permission_denials": {n: sum(r["permission_denials"] for r in arms[n].values())
                               for n in ARMS},
    }


def invalid(rows, expected):
    problems = []
    for name, records in rows.items():
        ids = [r["id"] for r in records]
        if sorted(ids) != sorted(expected):
            problems.append(f"{name}: graded {len(ids)} fixtures, expected {len(expected)} distinct")
        problems += [f"{name}/{r['id']}: {r['problems']}" for r in records if not r["valid"]]
    return problems


def decide(rows, audit, cases):
    report = {"endpoint": "fixture success", "margin": MARGIN, "alpha": ALPHA,
              "ceiling_rate": CEILING_RATE, "floor_rate": FLOOR_RATE,
              "quality_floor": QUALITY_FLOOR, "last_allowed_suite": True, "audit": audit,
              "not_applicable": {"step 6": "no earlier suite",
                                 "step 7": "arm A is the no-skill baseline"}}
    test = sorted(c["id"] for c in cases if c["split"] == "test")
    gate = sorted(c["id"] for c in cases if c["split"] == "gate")
    problems = ([] if audit.get("valid") else ["harness audit failed"]) + invalid(rows, test + gate)
    if CEILING_RATE <= 2 * MARGIN:
        problems.append("ceiling rate at or below twice the margin")
    if problems:
        return dict(report, verdict="INVALID", step=1, problems=problems)
    arms = {n: {r["id"]: r for r in rows[n]} for n in ARMS}
    kinds = {}
    for c in cases:
        if c["split"] == "test":
            kinds.setdefault(c["kind"], []).append(c["id"])
    report.update(describe(arms, test, gate, kinds))
    a, b = arms["a"], arms["b"]
    report["critical"] = {
        "gate_a_passed_b_failed": sorted(i for i in gate if a[i]["success"] and not b[i]["success"])}
    if any(report["critical"].values()):
        return dict(report, verdict="REGRESSION", step=2, reason="critical gate")
    if len(test) < N_TEST:
        return dict(report, verdict="INCONCLUSIVE", step=3,
                    reason=f"{len(test)} test clusters, fewer than {N_TEST}")
    wins, losses = len(report["b_only"]), len(report["a_only"])
    low, high = paired_interval(wins, losses, len(test), ALPHA)
    report["paired"] = {"b_only": wins, "a_only": losses, "effect": (wins - losses) / len(test),
                        "interval": [round(low, 4), round(high, 4)]}
    if high < -MARGIN:
        return dict(report, verdict="REGRESSION", step=4, reason="interval below -margin")
    a_rate, b_rate = rate(a, test), rate(b, test)
    report["floor"] = a_rate <= FLOOR_RATE or report["every_arm_failed"] == test
    report["ceiling"] = a_rate >= CEILING_RATE
    if report["floor"]:
        return dict(report, verdict="INCONCLUSIVE", step=5, reason="floor effect")
    accepted = b_rate >= QUALITY_FLOOR and all(b[i]["success"] for i in gate)
    if low > MARGIN and accepted:
        return dict(report, verdict="IMPROVEMENT", step=8)
    if -MARGIN <= low and high <= MARGIN and accepted:
        return dict(report, verdict="NO_MEANINGFUL_CHANGE", step=9)
    reason = "ceiling" if report["ceiling"] else (
        "interval crosses the margin" if accepted
        else "B below the quality floor or failed a gate fixture")
    return dict(report, verdict="INCONCLUSIVE", step=10, reason=reason)


def calibrate(rows, cases):
    dev = sorted(c["id"] for c in cases if c["split"] == "dev")
    problems = invalid({"a": rows}, dev)
    arm = {r["id"]: r for r in rows}
    value = None if problems else rate(arm, dev)
    low, high = CALIBRATION
    return {"n": len(dev), "a_success_rate": value, "problems": problems,
            "target": f"{low} < A <= {high}",
            "met": value is not None and low < value <= high,
            "check_rate": None if problems else
            {c: rate(arm, dev, lambda r, c=c: r["checks"][c]) for c in CHECKS}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir")
    parser.add_argument("--calibrate", action="store_true")
    args = parser.parse_args(argv)
    run_dir = Path(args.run_dir)
    cases = grader.load_cases()
    if args.calibrate:
        result = calibrate(load(run_dir / "grades" / "a.jsonl"), cases)
        print(json.dumps(result, indent=1))
        return 0 if result["met"] else 2
    rows = {n: load(run_dir / "grades" / f"{n}.jsonl") for n in ARMS}
    audit = json.loads((run_dir / "audit.json").read_text(encoding="utf-8"))
    report = decide(rows, audit, cases)
    print(json.dumps(report, indent=1, sort_keys=True))
    return CODES[report["verdict"]]


if __name__ == "__main__":
    sys.exit(main())
