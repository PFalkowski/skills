#!/usr/bin/env python3
"""Run one fresh headless Claude Code call per case and arm, then audit every transcript.

Usage:
  harness.py run --cases cases.json --splits dev [test gate] --arms control a [b]
                 --skill-a A.md --skill-b B.md --run-dir DIR [--seed N] [--jobs 4]
  harness.py audit --cases cases.json --splits ... --arms ... --run-dir DIR

`run` writes DIR/prompts, DIR/transcripts, DIR/<arm>/<id>.md and DIR/manifest.json,
then audits. Exit 0 when every call is clean, 3 when the run is INVALID.
"""
import argparse
import hashlib
import json
import random
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from prompt import build  # noqa: E402

MODEL = "claude-sonnet-5-5"
SKILL_SHA = {"a": "1ae5b1614a2b4016f5b2428b44f0dd7528f616dc2b463df9bfd32e153da93835",
             "b": "d651ab610c2f309c87ff6425585fa37f2abf23a49725c136ad032e988f364a3f"}


def command(add_dir):
    return ["claude", "-p", "--model", MODEL, "--tools", "Write", "--strict-mcp-config",
            "--setting-sources", "", "--permission-mode", "acceptEdits", "--add-dir", add_dir,
            "--no-session-persistence", "--output-format", "stream-json", "--verbose"]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def jobs(cases, splits, arms):
    return [(arm, c) for c in cases if c["split"] in splits for arm in arms]


def call(run_dir, arm, case, skill_text):
    out_dir = run_dir / arm
    prompt = build([case], str(out_dir), skill_text)
    prompt_path = run_dir / "prompts" / arm / f"{case['id']}.txt"
    prompt_path.write_text(prompt, encoding="utf-8")
    cwd = run_dir / "scratch" / f"{arm}-{case['id']}"
    cwd.mkdir(parents=True)
    base = run_dir / "transcripts" / arm / case["id"]
    with prompt_path.open("rb") as stdin, base.with_suffix(".jsonl").open("wb") as stdout, \
            base.with_suffix(".stderr").open("wb") as stderr:
        code = subprocess.run(command(str(out_dir)), cwd=cwd, stdin=stdin, stdout=stdout,
                              stderr=stderr).returncode
    base.with_suffix(".exit").write_text(str(code), encoding="utf-8")
    return {"arm": arm, "id": case["id"], "exit": code}


def audit(transcript, expected_path):
    """Return the list of reasons this one call makes the run INVALID."""
    if not transcript.is_file():
        return ["no transcript"]
    exit_file = transcript.with_suffix(".exit")
    problems = [] if exit_file.is_file() and exit_file.read_text() == "0" else ["nonzero exit"]
    records = []
    for line in transcript.read_text(encoding="utf-8").splitlines():
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            problems.append("unparseable transcript line")
    writes = set()
    for r in records:
        if r.get("type") == "system" and r.get("subtype") == "init" and r.get("model") != MODEL:
            problems.append(f"model {r.get('model')}")
        if r.get("type") == "system" and r.get("subtype") == "permission_denied":
            problems.append("permission denied")
        if r.get("type") == "rate_limit_event" and r["rate_limit_info"].get("status") == "rejected":
            problems.append("rate limited")
        if r.get("type") == "assistant":
            for block in r["message"].get("content", []):
                if block.get("type") == "tool_use":
                    if block["name"] != "Write":
                        problems.append(f"tool {block['name']}")
                    else:
                        writes.add(block["input"].get("file_path"))
        if r.get("type") == "user":
            for block in r["message"].get("content", []):
                if isinstance(block, dict) and block.get("is_error"):
                    problems.append("tool error")
    if writes != {str(expected_path)}:
        problems.append(f"write paths {sorted(map(str, writes))}")
    results = [r for r in records if r.get("type") == "result"]
    if len(results) != 1:
        problems.append(f"{len(results)} result records")
    elif (results[0].get("subtype") != "success" or results[0].get("is_error")
          or results[0].get("stop_reason") != "end_turn"):
        problems.append(f"result {results[0].get('subtype')} / {results[0].get('stop_reason')}")
    if not expected_path.is_file() or not expected_path.read_text(encoding="utf-8").strip():
        problems.append("missing or empty output")
    return problems


def audit_run(run_dir, todo):
    problems = {}
    cost = 0.0
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0,
             "cache_creation_input_tokens": 0}
    for arm, case in todo:
        transcript = run_dir / "transcripts" / arm / f"{case['id']}.jsonl"
        found = audit(transcript, run_dir / arm / f"{case['id']}.md")
        if found:
            problems[f"{arm}/{case['id']}"] = found
        if transcript.is_file():
            for line in transcript.read_text(encoding="utf-8").splitlines():
                record = json.loads(line)
                if record.get("type") == "result":
                    cost += record.get("total_cost_usd", 0)
                    for key in usage:
                        usage[key] += record.get("usage", {}).get(key, 0)
    return {"calls": len(todo), "invalid_calls": problems, "cost_usd": round(cost, 4),
            "usage": usage, "valid": not problems}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["run", "audit"])
    parser.add_argument("--cases", required=True)
    parser.add_argument("--splits", nargs="+", required=True)
    parser.add_argument("--arms", nargs="+", choices=["control", "a", "b"], required=True)
    parser.add_argument("--skill-a")
    parser.add_argument("--skill-b")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--seed", type=int, default=347)
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args(argv)
    run_dir = Path(args.run_dir).resolve()
    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))["cases"]
    todo = jobs(cases, set(args.splits), args.arms)
    if args.action == "run":
        if run_dir.exists():
            sys.exit(f"{run_dir} exists; every run needs a new directory")
        skills = {"control": None}
        for arm, path in (("a", args.skill_a), ("b", args.skill_b)):
            if arm in args.arms:
                if sha256(path) != SKILL_SHA[arm]:
                    sys.exit(f"skill {arm} hash mismatch")
                skills[arm] = Path(path).read_text(encoding="utf-8")
        for arm in args.arms:
            for sub in ("prompts", "transcripts"):
                (run_dir / sub / arm).mkdir(parents=True)
            (run_dir / arm).mkdir(parents=True)
        order = random.Random(args.seed).sample(todo, len(todo))
        manifest = {"date": date.today().isoformat(), "model": MODEL,
                    "cli": subprocess.run(["claude", "--version"], capture_output=True,
                                          text=True, check=True).stdout.strip(),
                    "commit": subprocess.run(["git", "-C", str(HERE), "rev-parse", "HEAD"],
                                             capture_output=True, text=True,
                                             check=True).stdout.strip(),
                    "cases_sha256": sha256(args.cases), "seed": args.seed, "jobs": args.jobs,
                    "skills": {arm: SKILL_SHA[arm] for arm in ("a", "b") if arm in args.arms},
                    "command": command("<run-dir>/<arm>"),
                    "order": [f"{arm}/{c['id']}" for arm, c in order]}
        with ThreadPoolExecutor(args.jobs) as pool:
            manifest["exits"] = list(pool.map(
                lambda job: call(run_dir, job[0], job[1], skills[job[0]]), order))
        (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    report = audit_run(run_dir, todo)
    (run_dir / "audit.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))
    return 0 if report["valid"] else 3


if __name__ == "__main__":
    sys.exit(main())
