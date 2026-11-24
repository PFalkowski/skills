#!/usr/bin/env python3
"""Grade an atomic-decomposition report against its fixture key (see EXPERIMENT.md).

Usage:
  grade.py --self-test
      Checks every fixture key and that every exemplar passes. Exit 0 on pass.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
KINDS = ("lying-doc", "any-ways", "compound", "executable", "unsettled")
ROOT_VERDICTS = {"confirmed", "refuted", "unsettled"}
ATOM_VERDICTS = ROOT_VERDICTS | {"not_checked"}
OPS = {"all", "any"}
SPLIT_COUNTS = {"dev": 10, "test": 24, "gate": 6}
EXEMPLAR_COMMANDS = ["python3 main.py"]


def load_cases(root=FIXTURES):
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(root).glob("*/case.json"))]


def flat(text):
    return re.sub(r"\s+", " ", text).strip() if isinstance(text, str) else ""


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


def false_confirmed(case, atoms):
    return [a.get("id") for a in atoms if a.get("verdict") == "confirmed"
            and any(re.search(p, flat(a.get("claim")), re.I) for p in case["false_confirms"])]


def deciding_ok(case, atoms):
    return all(any(a.get("verdict") == option["verdict"]
                   and re.search(option["pattern"],
                                 f"{flat(a.get('claim'))} {flat(a.get('evidence'))}", re.I)
                   for option in [entry, *entry.get("or", [])] for a in atoms)
               for entry in case["deciding"])


def ran(case, commands):
    return all(any(re.search(p, c, re.M) for c in commands) for p in case["must_run"])


def grade(case, text, commands):
    try:
        report = json.loads(text)
    except (TypeError, ValueError, RecursionError):
        report = None
    atoms = atoms_of(report)
    shape = shape_ok(report)
    wrong = false_confirmed(case, atoms)
    root = report.get("root") if isinstance(report, dict) else None
    checks = {"shape": shape,
              "root": isinstance(root, dict) and root.get("verdict") == case["root"],
              "deciding": deciding_ok(case, atoms),
              "no_false_confirm": not wrong,
              "consistent": shape and consistent(report),
              "ran": ran(case, commands)}
    return {"checks": checks, "success": all(checks.values()), "false_confirmed": wrong,
            "atoms": len(atoms)}


def bash_commands(records):
    denied = {r.get("tool_use_id") for r in records
              if r.get("type") == "system" and r.get("subtype") == "permission_denied"}
    return [block["input"].get("command", "") for r in records if r.get("type") == "assistant"
            for block in r["message"].get("content", [])
            if block.get("type") == "tool_use" and block.get("name") == "Bash"
            and block.get("id") not in denied]


def key_problems(case, fixture_dir):
    problems = []
    number = int(case["id"].rsplit("-", 1)[1])
    expected_split = "dev" if number <= 2 else "gate" if case["kind"] == "unsettled" else "test"
    if case["id"] != fixture_dir.name or case["kind"] not in KINDS \
            or not case["id"].startswith(case["kind"] + "-"):
        problems.append("id or kind")
    if case["split"] != expected_split:
        problems.append(f"split {case['split']}, expected {expected_split}")
    options = [o for e in case["deciding"] for o in [e, *e.get("or", [])]]
    if case["root"] not in ROOT_VERDICTS or not case["deciding"] \
            or any(o["verdict"] not in ROOT_VERDICTS for o in options):
        problems.append("verdicts")
    for pattern in [o["pattern"] for o in options] + case["false_confirms"] + case["must_run"]:
        try:
            re.compile(pattern)
        except re.error as exc:
            problems.append(f"regex {pattern!r}: {exc}")
    repo = fixture_dir / "repo"
    if not repo.is_dir() or (repo / "report.json").exists():
        problems.append("repo missing or holds report.json")
    if case["must_run"] and not (repo / "main.py").is_file():
        problems.append("must_run without main.py")
    if not problems and not grade(case, json.dumps(case["exemplar"]), EXEMPLAR_COMMANDS)["success"]:
        problems.append(f"exemplar fails: {grade(case, json.dumps(case['exemplar']), EXEMPLAR_COMMANDS)}")
    return problems


def self_test(root=FIXTURES):
    cases = load_cases(root)
    failures = {c["id"]: key_problems(c, Path(root) / c["id"]) for c in cases}
    failures = {k: v for k, v in failures.items() if v}
    counts = {s: sum(c["split"] == s for c in cases) for s in SPLIT_COUNTS}
    if counts != SPLIT_COUNTS:
        failures["splits"] = [f"{counts}, expected {SPLIT_COUNTS}"]
    for name, problems in failures.items():
        print("FAIL:", name, problems)
    print(json.dumps({"self_test": "fail" if failures else "pass", "fixtures": len(cases)}))
    return 1 if failures else 0


if __name__ == "__main__":
    if sys.argv[1:] != ["--self-test"]:
        sys.exit(__doc__)
    sys.exit(self_test())
