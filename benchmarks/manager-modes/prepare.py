#!/usr/bin/env python3
"""Snapshot each arm of the manager modes benchmark and write what subjects and graders may read.

Subjects get a skill folder under a blind label and a case file holding the situation only.
Graders get the situation and the criteria's questions, never `pass_when`. The label-to-arm
map stays in <state>/private.
"""
import argparse
import io
import json
import random
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
KEEP = ("manager/", "workflows/manager")


def blind_labels(names, seed):
    labels = [f"v{i + 1}" for i in range(len(names))]
    random.Random(seed).shuffle(labels)
    return dict(zip(sorted(names), labels))


def frontmatter_only(skill_text):
    parts = skill_text.split("---", 2)
    return f"---{parts[1]}---\n"


def snapshot(sha, dest):
    archive = subprocess.run(["git", "-C", str(REPO), "archive", sha, "manager", "workflows"],
                             capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            if member.isfile() and member.name.startswith(KEEP):
                target = dest / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())


BANNED = ("mode", "hand off", "delegate", "manager session")


def case_faults(case, split):
    """What breaks AUTHORING.md's contract in one case; empty when it is sound."""
    faults = []
    if case.get("split") != split or case.get("cluster") != case.get("id"):
        faults.append("split or cluster does not match its file")
    if case.get("critical") is not (split == "gate"):
        faults.append("critical must be true for gate cases only")
    situation = case.get("situation", "")
    if not 0 < len(situation.split()) <= 200:
        faults.append("situation is empty or over 200 words")
    faults += [f"situation uses the word {w!r}" for w in BANNED if w in situation.lower()]
    criteria = case.get("criteria") or []
    if not 1 <= len(criteria) <= 3 or len({c.get("id") for c in criteria}) != len(criteria):
        faults.append("needs one to three criteria with distinct ids")
    if any(not isinstance(c.get("pass_when"), bool) or not c.get("question", "").endswith("?") for c in criteria):
        faults.append("each criterion needs a question and a true/false pass_when")
    if split == "dev" and sorted(e.get("kind") for e in case.get("examples", [])) != ["alt", "bad", "good"]:
        faults.append("a dev case needs good, bad and alt examples")
    return faults


def load_cases(split):
    cases = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((HERE / "cases" / split).glob("*.json"))]
    faults = [f"{c.get('id')}: {fault}" for c in cases for fault in case_faults(c, split)]
    if faults:
        raise SystemExit("cases break AUTHORING.md:\n" + "\n".join(faults))
    return cases


def write_views(state, cases):
    for case in cases:
        subject = state / "subject" / "cases" / f"{case['id']}.md"
        subject.parent.mkdir(parents=True, exist_ok=True)
        subject.write_text(case["situation"] + "\n", encoding="utf-8")
        grader = state / "grader" / f"{case['id']}.json"
        grader.parent.mkdir(parents=True, exist_ok=True)
        view = {"situation": case["situation"],
                "criteria": [{"id": c["id"], "question": c["question"]} for c in case["criteria"]]}
        grader.write_text(json.dumps(view, indent=2, ensure_ascii=False), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    state = parser.parse_args().state.expanduser().resolve()
    config = json.loads((HERE / "arms.json").read_text(encoding="utf-8"))
    labels = blind_labels(config["arms"], config["label_seed"])
    for name, sha in config["arms"].items():
        dest = state / "arms" / labels[name]
        if name == config["control"]:
            skill = subprocess.run(["git", "-C", str(REPO), "show", f"{sha}:manager/SKILL.md"],
                                   capture_output=True, check=True).stdout.decode("utf-8")
            (dest / "manager").mkdir(parents=True, exist_ok=True)
            (dest / "manager" / "SKILL.md").write_text(frontmatter_only(skill), encoding="utf-8")
        else:
            snapshot(sha, dest)
    private = state / "private"
    private.mkdir(parents=True, exist_ok=True)
    (private / "arms.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    dev, scored = load_cases("dev"), load_cases("test") + load_cases("gate")
    write_views(state, dev + scored)
    files = {label: sorted(str(p.relative_to(state / "arms" / label)) for p in (state / "arms" / label).rglob("*") if p.is_file())
             for label in labels.values()}
    for name, cases in (("dev", dev), ("scored", scored)):
        args = {"root": str(state), "arms": sorted(labels.values()), "files": files,
                "cases": [c["id"] for c in cases], "trials": config["trials"]}
        (state / f"args-{name}.json").write_text(json.dumps(args), encoding="utf-8")
        print(f"{name}: {len(cases)} case(s)")
    examples = {c["id"]: {e["kind"]: e["plan"] for e in c["examples"]} for c in dev}
    args = {"root": str(state), "arms": ["good", "bad", "alt"], "cases": sorted(examples), "examples": examples}
    (state / "args-examples.json").write_text(json.dumps(args, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
