#!/usr/bin/env python3
"""Frozen decision rule for the real-prose unslop suite (see EXPERIMENT.md).

Usage:
  analyze.py RUN_DIR --calibrate
      RUN_DIR holds control.jsonl and a.jsonl for the dev split. Prints both arms'
      dev success rates and whether the rung meets its calibration target.
  analyze.py RUN_DIR [--earlier-effects X ...] [--not-last-suite]
      RUN_DIR holds control.jsonl, a.jsonl and b.jsonl (grade_real.py output for
      the test and gate splits) and audit.json (harness.py). Prints one JSON report.
      Exit 0 improvement or no meaningful change, 1 regression, 2 inconclusive, 3 invalid.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "benchmark-skill" / "scripts"))
from score import paired_interval  # noqa: E402

N_TEST = 30
ALPHA = 0.05
MARGIN = 0.20
CEILING_RATE = 0.80
FLOOR_RATE = MARGIN
QUALITY_FLOOR = 0.70
PATTERN_LOSS_MIN = 2
PRIMARY, SECONDARY = "original", "current"
ARMS = ("control", "a", "b")
CODES = {"IMPROVEMENT": 0, "NO_MEANINGFUL_CHANGE": 0, "REGRESSION": 1, "INCONCLUSIVE": 2,
         "INVALID": 3}


def load(path):
    records = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()
               if line.strip()]
    return {r["id"]: r for r in records}


def passed(record, endpoint):
    return record["valid"] and record["success"][endpoint]


def rate(arm, ids, endpoint):
    return sum(passed(arm[i], endpoint) for i in ids) / len(ids)


def paired(a, b, ids, endpoint):
    wins = sum(passed(b[i], endpoint) and not passed(a[i], endpoint) for i in ids)
    losses = sum(passed(a[i], endpoint) and not passed(b[i], endpoint) for i in ids)
    low, high = paired_interval(wins, losses, len(ids), ALPHA)
    return {"b_only": wins, "a_only": losses, "effect": (wins - losses) / len(ids),
            "interval": [round(low, 4), round(high, 4)]}


def residual_passages(arm, ids, endpoint, pattern):
    return sum(1 for i in ids if arm[i]["valid"]
               and arm[i]["hits_rewrite"][endpoint].get(pattern, 0) > 0)


def describe(arms, test, gate):
    a = arms["a"]
    patterns = sorted(next(r for r in a.values() if r["valid"])["hits_rewrite"][SECONDARY])
    lists = {}
    for endpoint in (PRIMARY, SECONDARY):
        names = sorted(next(r for r in a.values() if r["valid"])["hits_rewrite"][endpoint])
        lists[endpoint] = {
            "success_rate": {n: rate(arms[n], test, endpoint) for n in ARMS},
            "gate_passed": {n: sorted(i for i in gate if passed(arms[n][i], endpoint))
                            for n in ARMS},
            "a_vs_b": paired(arms["a"], arms["b"], test, endpoint),
            "control_vs_a": paired(arms["control"], arms["a"], test, endpoint),
            "residual_passages": {p: {n: residual_passages(arms[n], test, endpoint, p)
                                      for n in ARMS} for p in names},
            "residual_hits": {p: {n: sum(arms[n][i]["hits_rewrite"][endpoint][p] for i in test)
                                  for n in ARMS} for p in names},
            "residual_hits_total": {n: sum(arms[n][i]["residual"][endpoint] for i in test
                                           if arms[n][i]["valid"]) for n in ARMS},
        }
    by_case = {i: {n: passed(arms[n][i], PRIMARY) for n in ARMS} for i in test}
    return {
        "lists": lists,
        "source_coverage": {p: sum(1 for i in test if a[i]["hits_source"][SECONDARY][p] > 0)
                            for p in patterns},
        "gate_source_coverage": {p: sum(1 for i in gate if a[i]["hits_source"][SECONDARY][p] > 0)
                                 for p in patterns},
        "all_passed": sorted(i for i, v in by_case.items() if all(v.values())),
        "all_failed": sorted(i for i, v in by_case.items() if not any(v.values())),
        "only_one_passed": {i: next(n for n, ok in v.items() if ok)
                            for i, v in sorted(by_case.items()) if sum(v.values()) == 1},
        "rules_or_facts_dropped": {n: sorted(i for i in test + gate if arms[n][i]["valid"]
                                             and not (arms[n][i]["facts_kept"]
                                                      and arms[n][i]["rules_kept"]))
                                   for n in ARMS},
    }


def critical(arms, test, gate):
    a, b = arms["a"], arms["b"]
    kept = {n: {i for i in test + gate if arms[n][i]["facts_kept"] and arms[n][i]["rules_kept"]}
            for n in ("a", "b")}
    names = sorted(next(r for r in a.values() if r["valid"])["hits_rewrite"][PRIMARY])
    return {
        "rule_fact": sorted(kept["a"] - kept["b"]),
        "pattern_loss": sorted(p for p in names if residual_passages(a, test, PRIMARY, p) == 0
                               and residual_passages(b, test, PRIMARY, p) >= PATTERN_LOSS_MIN),
        "gate_a_passed_b_failed": sorted(i for i in gate if passed(a[i], PRIMARY)
                                         and not passed(b[i], PRIMARY)),
    }


def decide(arms, audit, earlier_effects=(), last_suite=True):
    report = {"endpoint": PRIMARY, "margin": MARGIN, "alpha": ALPHA,
              "ceiling_rate": CEILING_RATE, "floor_rate": FLOOR_RATE,
              "quality_floor": QUALITY_FLOOR, "last_allowed_suite": last_suite,
              "earlier_suite_effects": list(earlier_effects), "audit": audit}
    ids = {n: set(arm) for n, arm in arms.items()}
    problems = [] if audit.get("valid") else ["harness audit failed"]
    if len({frozenset(v) for v in ids.values()}) != 1:
        problems.append("arms graded different cases")
    problems += [f"{n}/{i}: {r['invalid_reason']}" for n, arm in arms.items()
                 for i, r in sorted(arm.items()) if not r["valid"]]
    test = sorted(i for i, r in arms["a"].items() if r["split"] == "test")
    gate = sorted(i for i, r in arms["a"].items() if r["split"] == "gate")
    if CEILING_RATE <= 2 * MARGIN:
        problems.append("ceiling rate at or below twice the margin")
    if problems:
        return dict(report, verdict="INVALID", step=1, problems=problems)

    report.update(describe(arms, test, gate))
    gates = critical(arms, test, gate)
    report["critical"] = gates
    if any(gates.values()):
        return dict(report, verdict="REGRESSION", step=2, reason="critical gate")
    if len(test) < N_TEST:
        return dict(report, verdict="INCONCLUSIVE", step=3,
                    reason=f"{len(test)} test clusters, fewer than {N_TEST}")
    primary = report["lists"][PRIMARY]
    low, high = primary["a_vs_b"]["interval"]
    if high < -MARGIN:
        return dict(report, verdict="REGRESSION", step=4, reason="interval below -margin")
    a_rate = primary["success_rate"]["a"]
    floor = a_rate <= FLOOR_RATE or not any(
        passed(arms[n][i], PRIMARY) for n in ARMS for i in test)
    ceiling = a_rate >= CEILING_RATE
    report["ceiling"], report["floor"] = ceiling, floor
    if (ceiling or floor) and not last_suite:
        return dict(report, verdict="INCONCLUSIVE", step=5, next_step="run the next rung",
                    reason="ceiling" if ceiling else "floor effect")
    if floor:
        return dict(report, verdict="INCONCLUSIVE", step=5, reason="floor effect")
    if any(e < -MARGIN for e in earlier_effects):
        return dict(report, verdict="INCONCLUSIVE", step=6, reason="earlier loss")
    if primary["control_vs_a"]["effect"] <= MARGIN:
        return dict(report, verdict="INCONCLUSIVE", step=7, reason="skill not visible")
    accepted = (primary["success_rate"]["b"] >= QUALITY_FLOOR
                and set(gate) <= set(primary["gate_passed"]["b"]))
    if low > MARGIN and accepted:
        return dict(report, verdict="IMPROVEMENT", step=8)
    if -MARGIN <= low and high <= MARGIN and accepted:
        return dict(report, verdict="NO_MEANINGFUL_CHANGE", step=9)
    reason = "ceiling" if ceiling else (
        "interval crosses the margin" if accepted
        else "B below the quality floor or failed a gate case")
    return dict(report, verdict="INCONCLUSIVE", step=10, reason=reason)


def calibrate(control, a):
    ids = sorted(a)
    rates = {"control": rate(control, ids, PRIMARY), "a": rate(a, ids, PRIMARY)}
    return {"n": len(ids), "success_rate": rates,
            "target": f"{FLOOR_RATE} < A <= {CEILING_RATE - MARGIN}, control < A - {MARGIN}",
            "met": FLOOR_RATE < rates["a"] <= CEILING_RATE - MARGIN + 1e-9
            and rates["a"] - rates["control"] > MARGIN}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir")
    parser.add_argument("--earlier-effects", nargs="*", type=float, default=[])
    parser.add_argument("--not-last-suite", action="store_true")
    parser.add_argument("--calibrate", action="store_true")
    args = parser.parse_args(argv)
    run_dir = Path(args.run_dir)
    if args.calibrate:
        print(json.dumps(calibrate(load(run_dir / "control.jsonl"), load(run_dir / "a.jsonl")),
                         indent=1))
        return 0
    arms = {n: load(run_dir / f"{n}.jsonl") for n in ARMS}
    audit = json.loads((run_dir / "audit.json").read_text(encoding="utf-8"))
    report = decide(arms, audit, args.earlier_effects, not args.not_last_suite)
    print(json.dumps(report, indent=1, sort_keys=True))
    return CODES[report["verdict"]]


if __name__ == "__main__":
    sys.exit(main())
