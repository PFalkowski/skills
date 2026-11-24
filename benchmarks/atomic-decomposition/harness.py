#!/usr/bin/env python3
"""Run one fresh headless Claude Code call per fixture and arm, then audit and grade.

Usage:
  harness.py run --arms a [b] --splits dev|test|gate [...] --run-dir DIR
                 [--skill SKILL.md] [--seed N] [--jobs 4]
  harness.py audit --run-dir DIR [--skill SKILL.md]
  harness.py grade --run-dir DIR [--skill SKILL.md]

`run` writes DIR/manifest.json, DIR/prompts, DIR/transcripts, DIR/reports and DIR/scratch,
then audits. `grade` audits and writes DIR/grades/<arm>.jsonl. Arm b needs --skill and
never runs on dev. Exit 0 when every call is clean, 3 when the run is INVALID.
"""
import argparse
import hashlib
import json
import random
import shutil
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import grade as grader  # noqa: E402

MODEL = "claude-sonnet-5-5"
SKILL_SHA = "c38164d4432ee2a49b612c3f0cdfd3463b56f06416ed2dd56bdbb304664653b9"
TOOLS = ("Read", "Grep", "Glob", "Write", "Bash")
ALLOWED = ("Read", "Grep", "Glob", "Write", "Bash(python3:*)", "Bash(node:*)", "Bash(ls:*)",
           "Bash(cat:*)", "Bash(grep:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(find:*)", "Bash(wc:*)")
COMMAND = ["claude", "-p", "--model", MODEL, "--tools", ",".join(TOOLS), "--allowedTools",
           *ALLOWED, "--strict-mcp-config", "--setting-sources", "", "--permission-mode",
           "acceptEdits", "--no-session-persistence", "--output-format", "stream-json", "--verbose"]
PREAMBLE = "The following skill applies to this task. Follow it.\n\n<skill>\n"
TASK = """Decide whether the claim below is true of the code in the current directory. Use only the files here and commands you run here, with no network. Settle it by evidence, not by what a comment or a document says.

Claim: {claim}

Write your answer as JSON to report.json in the current directory, and nothing else in that file. Shape:
{"root": {"claim": "<the claim, restated so it can be checked>", "verdict": "confirmed|refuted|unsettled", "op": "all|any"},
 "atoms": [{"id": "A1", "parent": "root", "op": "all|any", "claim": "<one checkable statement>", "verdict": "confirmed|refuted|unsettled|not_checked", "evidence": "<the command and its real output, or the quoted lines>"}]}
"parent" is "root" or the id of another atom. "op" says how the children of that node combine; give it on the root and on every atom that has children, and leave it out on a leaf. A parent verdict must follow from its children: an all-parent is refuted if any child is refuted, confirmed if every child is confirmed, otherwise unsettled; an any-parent is confirmed if any child is confirmed, refuted if every child is refuted, otherwise unsettled; children marked not_checked are ignored. Use unsettled when the evidence needed is not available here."""
KEY_MARKERS = ("case.json", "atomic-decomposition/fixtures")
IGNORE = shutil.ignore_patterns("__pycache__")
EXCLUDED = ("atomic-decomposition", "benchmarks/skill-context/RESULTS-atomic-decomposition.md",
            "benchmarks/skill-context/cases-atomic-decomposition.json", ".claude")


def build(case, skill=None):
    task = TASK.replace("{claim}", case["claim"])
    return task if skill is None else PREAMBLE + skill + "\n</skill>\n\n" + task


def fill(scratch, case):
    repo = grader.FIXTURES / case["id"] / "repo"
    if repo.is_dir() or "repo_ref" not in case:
        shutil.copytree(repo, scratch, dirs_exist_ok=True, ignore=IGNORE)
        return
    archive = subprocess.run(["git", "-C", str(HERE.parents[1]), "archive", case["repo_ref"]],
                             stdout=subprocess.PIPE, check=True).stdout
    subprocess.run(["tar", "-x", "-C", str(scratch)], input=archive, check=True)
    for excluded in map(scratch.joinpath, EXCLUDED):
        if excluded.is_dir():
            shutil.rmtree(excluded)
        elif excluded.exists():
            excluded.unlink()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fixtures_digest(root=grader.FIXTURES):
    digest = hashlib.sha256()
    for path in sorted(p for p in Path(root).rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        digest.update(str(path.relative_to(root)).encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


def read_skill(path):
    data = Path(path).read_bytes()
    if sha256(data) != SKILL_SHA:
        sys.exit("skill hash mismatch")
    return data.decode("utf-8")


def call(run_dir, arm, case, stop):
    if stop.is_set():
        return {"arm": arm, "id": case["id"], "exit": None}
    scratch = Path(tempfile.mkdtemp(prefix="atomic-"))
    fill(scratch, case)
    base = run_dir / "transcripts" / arm / case["id"]
    with (run_dir / "prompts" / arm / f"{case['id']}.txt").open("rb") as stdin, \
            base.with_suffix(".jsonl").open("wb") as stdout, \
            base.with_suffix(".stderr").open("wb") as stderr:
        code = subprocess.run(COMMAND, cwd=scratch, stdin=stdin, stdout=stdout,
                              stderr=stderr).returncode
    base.with_suffix(".exit").write_text(str(code), encoding="utf-8")
    report = scratch / "report.json"
    if report.is_file():
        shutil.copyfile(report, run_dir / "reports" / arm / f"{case['id']}.json")
    shutil.copytree(scratch, run_dir / "scratch" / arm / case["id"], ignore=IGNORE)
    shutil.rmtree(scratch)
    if "rate limited" in audit_transcript(base.with_suffix(".jsonl")):
        stop.set()
    return {"arm": arm, "id": case["id"], "exit": code}


def records_of(transcript):
    return [json.loads(line) for line in transcript.read_text(encoding="utf-8").splitlines()
            if line.strip()]


def audit_transcript(transcript):
    """Return the reasons this one transcript makes the run INVALID."""
    if not transcript.is_file():
        return ["no transcript"]
    exit_file = transcript.with_suffix(".exit")
    problems = [] if exit_file.is_file() and exit_file.read_text() == "0" else ["nonzero exit"]
    try:
        records = records_of(transcript)
    except json.JSONDecodeError:
        return problems + ["unparseable transcript"]
    for r in records:
        if r.get("type") == "system" and r.get("subtype") == "init":
            if r.get("model") != MODEL:
                problems.append(f"model {r.get('model')}")
            if sorted(r.get("tools", [])) != sorted(TOOLS) or r.get("mcp_servers"):
                problems.append(f"environment tools {r.get('tools')} mcp {r.get('mcp_servers')}")
        if r.get("type") == "rate_limit_event" and r["rate_limit_info"].get("status") == "rejected":
            problems.append("rate limited")
        if r.get("type") == "assistant":
            if r["message"].get("stop_reason") in ("max_tokens", "model_context_window_exceeded"):
                problems.append("truncated")
            for block in r["message"].get("content", []):
                if block.get("type") != "tool_use":
                    continue
                if block["name"] not in TOOLS:
                    problems.append(f"tool {block['name']}")
                if any(m in json.dumps(block.get("input")) for m in KEY_MARKERS):
                    problems.append("answer key path touched")
    results = [r for r in records if r.get("type") == "result"]
    if len(results) != 1:
        problems.append(f"{len(results)} result records")
    else:
        result = results[0]
        if result.get("api_error_status") == 429:
            problems.append("rate limited")
        if result.get("subtype") != "success" or result.get("is_error") \
                or result.get("stop_reason") != "end_turn":
            problems.append(f"result {result.get('subtype')} / {result.get('stop_reason')}")
    return problems


def audit_call(run_dir, arm, case, skill):
    problems = audit_transcript(run_dir / "transcripts" / arm / f"{case['id']}.jsonl")
    report = run_dir / "reports" / arm / f"{case['id']}.json"
    if not report.is_file() or not report.read_text(encoding="utf-8").strip():
        problems.append("missing or empty report.json")
    prompt = run_dir / "prompts" / arm / f"{case['id']}.txt"
    if not prompt.is_file() or prompt.read_text(encoding="utf-8") != build(case, skill):
        problems.append("prompt differs from the builder")
    return problems


def todo_of(manifest, cases):
    return [(arm, c) for arm in manifest["arms"] for c in cases if c["split"] in manifest["splits"]]


def audit_run(run_dir, todo, skill, manifest):
    problems = {f"{arm}/{c['id']}": found for arm, c in todo
                if (found := audit_call(run_dir, arm, c, skill if arm == "b" else None))}
    if manifest.get("fixtures_sha256") != fixtures_digest():
        problems["fixtures"] = ["fixtures changed since the run"]
    return {"calls": len(todo), "invalid_calls": problems, "valid": not problems}


def cost_of(transcript):
    if not transcript.is_file():
        return {"cost_usd": 0.0, "usage": {}, "permission_denials": 0}
    result = next((r for r in records_of(transcript) if r.get("type") == "result"), {})
    usage = result.get("usage", {})
    return {"cost_usd": result.get("total_cost_usd", 0.0),
            "usage": {k: usage.get(k, 0) for k in ("input_tokens", "output_tokens",
                                                   "cache_read_input_tokens",
                                                   "cache_creation_input_tokens")},
            "permission_denials": len(result.get("permission_denials", []))}


def grade_run(run_dir, todo, audit):
    out = run_dir / "grades"
    out.mkdir(exist_ok=True)
    lines = {}
    for arm, case in todo:
        transcript = run_dir / "transcripts" / arm / f"{case['id']}.jsonl"
        report = run_dir / "reports" / arm / f"{case['id']}.json"
        commands = grader.bash_commands(records_of(transcript)) if transcript.is_file() else []
        text = report.read_text(encoding="utf-8") if report.is_file() else None
        problems = audit["invalid_calls"].get(f"{arm}/{case['id']}", [])
        record = {"id": case["id"], "arm": arm, "split": case["split"], "kind": case["kind"],
                  "valid": not problems, "problems": problems,
                  **grader.grade(case, text, commands), **cost_of(transcript)}
        lines.setdefault(arm, []).append(json.dumps(record, sort_keys=True))
    for arm, rows in lines.items():
        (out / f"{arm}.jsonl").write_text("\n".join(rows) + "\n", encoding="utf-8")


def run(run_dir, arms, splits, skill, seed, jobs, cases):
    todo = [(arm, c) for arm in arms for c in cases if c["split"] in splits]
    for arm in arms:
        for sub in ("prompts", "transcripts", "reports", "scratch"):
            (run_dir / sub / arm).mkdir(parents=True)
    for arm, case in todo:
        (run_dir / "prompts" / arm / f"{case['id']}.txt").write_text(
            build(case, skill if arm == "b" else None), encoding="utf-8")
    order = random.Random(seed).sample(todo, len(todo))
    manifest = {"date": date.today().isoformat(), "model": MODEL, "arms": arms, "splits": splits,
                "cli": subprocess.run(["claude", "--version"], capture_output=True, text=True,
                                      check=True).stdout.strip(),
                "commit": subprocess.run(["git", "-C", str(HERE), "rev-parse", "HEAD"],
                                         capture_output=True, text=True, check=True).stdout.strip(),
                "skill_sha256": SKILL_SHA if "b" in arms else None,
                "grader_sha256": sha256((HERE / "grade.py").read_bytes()),
                "fixtures_sha256": fixtures_digest(), "seed": seed, "jobs": jobs,
                "command": COMMAND, "order": [f"{arm}/{c['id']}" for arm, c in order]}
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    stop = threading.Event()
    with ThreadPoolExecutor(jobs) as pool:
        manifest["exits"] = list(pool.map(
            lambda job: call(run_dir, job[0], job[1], stop), order))
    manifest["stopped_on_rate_limit"] = stop.is_set()
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["run", "audit", "grade"])
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--arms", nargs="+", choices=["a", "b"])
    parser.add_argument("--splits", nargs="+", choices=["dev", "test", "gate"])
    parser.add_argument("--skill")
    parser.add_argument("--seed", type=int, default=5309)
    parser.add_argument("--jobs", type=int, default=4, choices=range(1, 5))
    args = parser.parse_args(argv)
    run_dir = Path(args.run_dir).resolve()
    cases = grader.load_cases()
    if args.action == "run":
        if not args.arms or not args.splits:
            parser.error("run needs --arms and --splits")
        if "b" in args.arms and "dev" in args.splits:
            parser.error("arm b never runs on dev")
        if run_dir.exists():
            parser.error(f"{run_dir} exists; every run needs a new directory")
    manifest_path = run_dir / "manifest.json"
    arms = args.arms if args.action == "run" else json.loads(
        manifest_path.read_text(encoding="utf-8"))["arms"]
    if "b" in arms and not args.skill:
        parser.error("arm b needs --skill")
    skill = read_skill(args.skill) if "b" in arms else None
    if args.action == "run":
        run(run_dir, args.arms, args.splits, skill, args.seed, args.jobs, cases)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    todo = todo_of(manifest, cases)
    report = audit_run(run_dir, todo, skill, manifest)
    (run_dir / "audit.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    if args.action == "grade":
        grade_run(run_dir, todo, report)
    print(json.dumps(report, indent=1))
    return 0 if report["valid"] else 3


if __name__ == "__main__":
    sys.exit(main())
