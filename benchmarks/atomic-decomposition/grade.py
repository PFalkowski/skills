#!/usr/bin/env python3
"""Grade an atomic-decomposition report against its fixture key (grade rule v2, see EXPERIMENT.md).

Usage:
  grade.py --self-test
      Checks every fixture key and that every exemplar passes. Exit 0 on pass.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
KINDS = ("universal", "any-ways", "unsettled", "looks-false")
SPLITS = ("dev", "test", "gate")
ROOT_VERDICTS = {"confirmed", "refuted", "unsettled"}
ATOM_VERDICTS = ROOT_VERDICTS | {"not_checked"}
OPS = {"all", "any"}
EXEMPLAR_COMMANDS = ["python3 main.py"]


def load_cases(root=FIXTURES):
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(root).glob("*/case.json"))]


def atoms_of(report):
    atoms = report.get("atoms") if isinstance(report, dict) else None
    return [a for a in atoms if isinstance(a, dict)] if isinstance(atoms, list) else []


def children_of(atoms):
    kids = {}
    for atom in atoms:
        kids.setdefault(atom.get("parent"), []).append(atom)
    return kids


def shape_ok(report):
    if not isinstance(report, dict) or not isinstance(report.get("atoms"), list):
        return False
    root = report.get("root")
    if not isinstance(root, dict) or root.get("verdict") not in ROOT_VERDICTS \
            or root.get("op") not in OPS or not isinstance(root.get("claim"), str):
        return False
    atoms = report["atoms"]
    if len(atoms) != len(atoms_of(report)):
        return False
    ids = [a.get("id") for a in atoms]
    if any(not isinstance(i, str) or i == "root" for i in ids) or len(set(ids)) != len(ids):
        return False
    for atom in atoms:
        if atom.get("verdict") not in ATOM_VERDICTS or not isinstance(atom.get("claim"), str) \
                or not isinstance(atom.get("evidence", ""), str) \
                or atom.get("parent") not in set(ids) | {"root"}:
            return False
    kids = children_of(atoms)
    if any(a.get("op") not in OPS for a in atoms if a["id"] in kids):
        return False
    reached, todo = set(), ["root"]
    while todo:
        for child in kids.get(todo.pop(), []):
            reached.add(child["id"])
            todo.append(child["id"])
    return reached == set(ids)


def propagate(op, verdicts):
    counted = [v for v in verdicts if v != "not_checked"]
    if not counted:
        return "unsettled"
    decisive, other = ("refuted", "confirmed") if op == "all" else ("confirmed", "refuted")
    if decisive in counted:
        return decisive
    return other if all(v == other for v in counted) else "unsettled"


def consistent(report):
    kids = children_of(report["atoms"])
    nodes = [report["root"] | {"id": "root"}] + [a for a in report["atoms"] if a["id"] in kids]
    return all(propagate(node["op"], [c["verdict"] for c in kids.get(node["id"], [])])
               == node["verdict"] for node in nodes)


def report_text(report):
    root = report.get("root") if isinstance(report, dict) else None
    parts = [root.get("claim")] if isinstance(root, dict) else []
    parts += [a.get(k) for a in atoms_of(report) for k in ("claim", "evidence")]
    return " ".join(p for p in parts if isinstance(p, str)).lower()


def evidence_ok(case, report):
    text = report_text(report)
    return all(any(token in text for token in group) for group in case["evidence_tokens"])


def ran(case, commands):
    return not case.get("must_run") or any(token in c.lower() for token in case["must_run"]
                                           for c in commands)


def grade(case, text, commands):
    try:
        report = json.loads(text)
    except (TypeError, ValueError, RecursionError):
        report = None
    shape = shape_ok(report)
    root = report.get("root") if isinstance(report, dict) else None
    checks = {"shape": shape,
              "root": isinstance(root, dict) and root.get("verdict") == case["root"],
              "evidence": evidence_ok(case, report),
              "consistent": shape and consistent(report),
              "ran": ran(case, commands)}
    return {"checks": checks, "success": all(checks.values()), "atoms": len(atoms_of(report))}


def bash_commands(records):
    denied = {r.get("tool_use_id") for r in records
              if r.get("type") == "system" and r.get("subtype") == "permission_denied"}
    return [block["input"].get("command", "") for r in records if r.get("type") == "assistant"
            for block in r["message"].get("content", [])
            if block.get("type") == "tool_use" and block.get("name") == "Bash"
            and block.get("id") not in denied]


def lowercase_strings(values):
    return isinstance(values, list) and bool(values) \
        and all(isinstance(v, str) and v and v == v.lower() for v in values)


def key_problems(case, fixture_dir):
    problems = []
    if case["id"] != fixture_dir.name or case["kind"] not in KINDS or case["split"] not in SPLITS:
        problems.append("id, kind or split")
    if case["root"] not in ROOT_VERDICTS or case["exemplar"]["root"]["verdict"] != case["root"]:
        problems.append("root")
    groups = case["evidence_tokens"]
    if not isinstance(groups, list) or not 1 <= len(groups) <= 3 \
            or not all(lowercase_strings(g) for g in groups):
        problems.append("evidence_tokens")
    if "must_run" in case and not lowercase_strings(case["must_run"]):
        problems.append("must_run")
    repo = fixture_dir / "repo"
    if not repo.is_dir() or (repo / "report.json").exists():
        problems.append("repo missing or holds report.json")
    if not problems:
        result = grade(case, json.dumps(case["exemplar"]), EXEMPLAR_COMMANDS)
        if not result["success"]:
            problems.append(f"exemplar fails: {result}")
    return problems


def self_test(root=FIXTURES):
    cases = load_cases(root)
    failures = {c["id"]: key_problems(c, Path(root) / c["id"]) for c in cases}
    failures = {k: v for k, v in failures.items() if v}
    if not cases:
        failures["fixtures"] = ["none found"]
    for name, problems in failures.items():
        print("FAIL:", name, problems)
    print(json.dumps({"self_test": "fail" if failures else "pass", "fixtures": len(cases)}))
    return 1 if failures else 0


if __name__ == "__main__":
    if sys.argv[1:] != ["--self-test"]:
        sys.exit(__doc__)
    sys.exit(self_test())
