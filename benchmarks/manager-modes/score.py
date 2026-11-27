#!/usr/bin/env python3
"""Score a manager modes benchmark run by benchmark-skill's decision rules (METHOD.md).

Reads the workflow's returned cells, the run's journal and the frozen cases, applies each
case's answer key, and reports reliable success per arm, the paired effect of each
comparison and its verdict.
"""
import argparse
import importlib.util
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
_spec = importlib.util.spec_from_file_location("benchmark_skill_score", REPO / "benchmark-skill" / "scripts" / "score.py")
_method = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_method)
paired_interval = _method.paired_interval

LISTING = re.compile(r"^(ls|find|cat|head|wc|tree)\b")


def parse_cells(cells):
    parsed = {}
    for cell in cells:
        case, arm, trial, answers = cell.split("|", 3)
        key = (case, arm, int(trial))
        if key in parsed:
            raise ValueError(f"duplicate cell {key}")
        parsed[key] = None if answers.startswith("MISSING") else {
            pair.split("=")[0]: pair.split("=")[1] == "1" for pair in answers.split(",") if pair}
    return parsed


def cell_passes(case, answers):
    return all(answers[c["id"]] == c["pass_when"] for c in case["criteria"])


def invalid_reasons(cases, arms, trials, parsed):
    reasons = []
    for case in cases:
        wanted = {c["id"] for c in case["criteria"]}
        for arm in arms:
            for trial in range(trials):
                answers = parsed.get((case["id"], arm, trial), "absent")
                if answers == "absent" or answers is None:
                    reasons.append(f"{case['id']} {arm} trial {trial}: no result")
                elif set(answers) != wanted:
                    reasons.append(f"{case['id']} {arm} trial {trial}: graded {sorted(answers)}, key has {sorted(wanted)}")
    extra = set(parsed) - {(c["id"], a, t) for c in cases for a in arms for t in range(trials)}
    return reasons + [f"unexpected cell {key}" for key in sorted(extra)]


def tool_fault(name, tool_input, allowed):
    """Why one tool use breaks the subject's fence, or None. A subject may read and list its own files only."""
    if name == "StructuredOutput":
        return None
    if name == "Read":
        paths = [str(tool_input.get("file_path", ""))]
    elif name in ("Glob", "Grep"):
        paths = [str(tool_input.get("path", ""))]
    elif name == "Bash":
        command = str(tool_input.get("command", "")).strip()
        if not command:
            return None
        if not LISTING.match(command) or re.search(r"[;&>`]|\$\(", command):
            return f"ran {command}"
        paths = re.findall(r"(?<![\w.])/[^\s|'\"]+", command) or [""]
    else:
        return f"used {name}"
    outside = [p for p in paths if not any(p == base or p.startswith(base + "/") for base in allowed)]
    return f"{name} outside its own files: {outside[0] or '(no path)'}" if outside else None


def contamination(journal_path, root):
    """Subjects that changed something, or read or listed anything but their own skill folder and case."""
    journal_path = Path(journal_path)
    found = []
    for line in journal_path.read_text(encoding="utf-8").splitlines():
        entry = json.loads(line)
        if entry.get("type") != "started" or not entry["label"].startswith("s|"):
            continue
        label = entry["label"]
        _, case, arm, _ = label.split("|")
        allowed = (f"{root}/arms/{arm}", f"{root}/subject/cases/{case}.md")
        transcript = journal_path.parent / f"agent-{entry['agentId']}.jsonl"
        if not transcript.exists():
            found.append(f"{label}: no transcript")
            continue
        faults = {tool_fault(name, tool_input, allowed) for name, tool_input in tool_uses(transcript)} - {None}
        found += [f"{label}: {fault}" for fault in sorted(faults)]
    return found


def tool_uses(transcript):
    for line in transcript.read_text(encoding="utf-8").splitlines():
        try:
            content = (json.loads(line).get("message") or {}).get("content")
        except json.JSONDecodeError:
            continue
        for block in content if isinstance(content, list) else []:
            if block.get("type") == "tool_use":
                yield block.get("name"), block.get("input") or {}


def cluster_passes(cases, arm, trials, parsed):
    """cluster id -> True when every case and every trial in it passes for the arm."""
    result = {}
    for case in cases:
        ok = all(cell_passes(case, parsed[(case["id"], arm, t)]) for t in range(trials))
        result[case["cluster"]] = result.get(case["cluster"], True) and ok
    return result


def decide(*, n, wins, losses, a_rate, b_rate, decision, critical_regression, b_fails_critical,
           control_effect, all_arms_fail_everything=False):
    """METHOD.md § Verdict precedence, steps 2 to 10. Returns (verdict, reason, interval)."""
    m = decision["margin"]
    low, high = paired_interval(wins, losses, n, decision["alpha"])
    interval = (round(low, 3), round(high, 3))
    if decision["ceiling_rate"] <= 2 * m:
        return "INVALID", "ceiling rate at or below twice the margin", interval
    if decision["grader_validated"] and critical_regression:
        return "REGRESSION", "a critical case A passed fails in B", interval
    sound = (decision["grader_validated"] and decision["holdout_frozen"]
             and decision["sampling"] == "representative" and n >= decision["min_clusters"])
    if not sound:
        return "INCONCLUSIVE", "design: graders, holdout, sampling or cluster count", interval
    if high < -m:
        return "REGRESSION", "interval below the negative margin", interval
    floor = a_rate <= m or all_arms_fail_everything
    ceiling = a_rate >= decision["ceiling_rate"]
    if (floor or ceiling) and not decision["last_allowed_suite"]:
        return "INCONCLUSIVE", "run the next rung", interval
    if floor:
        return "INCONCLUSIVE", "floor effect", interval
    if any(effect < -m for effect in decision["earlier_suite_effects"]):
        return "INCONCLUSIVE", "earlier loss", interval
    if control_effect <= m:
        return "INCONCLUSIVE", "skill not visible", interval
    acceptable = b_rate >= decision["quality_floor"] and not b_fails_critical
    if low > m and acceptable:
        return "IMPROVEMENT", "interval above the margin", interval
    if low >= -m and high <= m and acceptable:
        return "NO_MEANINGFUL_CHANGE", "interval inside the margin", interval
    return "INCONCLUSIVE", "ceiling" if ceiling else "interval not decisive", interval


def analyze(config, cases, parsed, contaminated=()):
    names, trials, decision = list(config["arms"]), config["trials"], config["decision"]
    reasons = invalid_reasons(cases, names, trials, parsed) + list(contaminated)
    if reasons:
        return {"verdict": "INVALID", "invalid": reasons}
    test = [c for c in cases if c["split"] == "test"]
    critical = [c for c in cases if c["critical"]]
    clusters = {arm: cluster_passes(test, arm, trials, parsed) for arm in names}
    n = len(next(iter(clusters.values())))
    rate = {arm: sum(clusters[arm].values()) / n for arm in names}
    crit = {arm: {c["id"]: all(cell_passes(c, parsed[(c["id"], arm, t)]) for t in range(trials)) for c in critical}
            for arm in names}

    def effect(a, b):
        wins = sum(clusters[b][k] and not clusters[a][k] for k in clusters[a])
        losses = sum(clusters[a][k] and not clusters[b][k] for k in clusters[a])
        return wins, losses

    nothing_passes = not any(any(passed.values()) for passed in clusters.values())
    comparisons = []
    for a, b in config["comparisons"]:
        wins, losses = effect(a, b)
        control_wins, control_losses = effect(config["control"], a)
        verdict, reason, interval = decide(
            n=n, wins=wins, losses=losses, a_rate=rate[a], b_rate=rate[b], decision=decision,
            critical_regression=any(crit[a][c] and not crit[b][c] for c in crit[a]),
            b_fails_critical=not all(crit[b].values()),
            control_effect=(control_wins - control_losses) / n, all_arms_fail_everything=nothing_passes)
        comparisons.append({"a": a, "b": b, "wins": wins, "losses": losses, "n": n,
                            "effect": round((wins - losses) / n, 3), "interval": interval,
                            "verdict": verdict, "reason": reason})
    per_case = {c["id"]: {arm: sum(cell_passes(c, parsed[(c["id"], arm, t)]) for t in range(trials)) for arm in names}
                for c in cases}
    full = lambda case_id, arm: per_case[case_id][arm] == trials
    return {
        "verdict": "VALID", "test_clusters": n, "trials": trials,
        "reliable_success": {arm: round(rate[arm], 3) for arm in names},
        "critical": crit, "comparisons": comparisons, "per_case": per_case,
        "case_lists": {
            "every_arm_passed": [c for c in per_case if all(full(c, a) for a in names)],
            "every_arm_failed": [c for c in per_case if not any(full(c, a) for a in names)],
            "only_one_arm_passed": {c: [a for a in names if full(c, a)][0] for c in per_case
                                    if sum(full(c, a) for a in names) == 1},
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--run", required=True, type=Path, help="the workflow's return value, as JSON")
    parser.add_argument("--journal", required=True, type=Path, nargs="+")
    parser.add_argument("--splits", nargs="+", default=["test", "gate"])
    options = parser.parse_args()
    state = options.state.expanduser().resolve()
    config = json.loads((HERE / "arms.json").read_text(encoding="utf-8"))
    labels = json.loads((state / "private" / "arms.json").read_text(encoding="utf-8"))
    name_of = {label: name for name, label in labels.items()}
    cases = [json.loads(p.read_text(encoding="utf-8"))
             for split in options.splits for p in sorted((HERE / "cases" / split).glob("*.json"))]
    by_label = parse_cells(json.loads(options.run.read_text(encoding="utf-8"))["cells"])
    parsed = {(case, name_of[label], trial): answers for (case, label, trial), answers in by_label.items()}
    contaminated = [found for journal in options.journal for found in contamination(journal, str(state))]
    report = analyze(config, cases, parsed, contaminated)
    (state / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
