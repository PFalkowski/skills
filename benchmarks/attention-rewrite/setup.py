"""Build the sandbox for one benchmark run.

    python benchmarks/attention-rewrite/setup.py <private-clone> <output-folder>

Creates <out>/repo (history of the start tag only, branch main, no remote) and
<out>/task/ISSUE.md and <out>/task/PROMPT.md (from the fixtures tag). The candidate works in
<out>/repo and reads the task files beside it. Nothing in the private clone is changed.
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))
import gitutil
from gitutil import GitError, PINS, git

TASK_FILES = ("ISSUE.md", "PROMPT.md")


class SetupError(Exception):
    pass


def check_output_folder(out, private):
    """Refuse a folder that already holds anything, or that sits inside the private clone."""
    out, private = Path(out).resolve(), Path(private).resolve()
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        raise SetupError(f"{out} is not an empty folder; use a fresh one")
    if out == private or private in out.parents:
        raise SetupError(f"{out} is inside the private clone; use a folder outside it")


def check_isolation(repo, forbidden, start_commit):
    """No ref other than main, no remote, no commit past the start, and none of the forbidden objects."""
    problems = []
    refs = git(repo, "for-each-ref", "--format=%(refname)").splitlines()
    if refs != ["refs/heads/main"]:
        problems.append(f"unexpected refs: {refs}")
    if git(repo, "remote"):
        problems.append("a remote is configured")
    ahead = git(repo, "rev-list", "--all", "--not", start_commit).split()
    if ahead:
        problems.append(f"commits reachable that are not in the start history: {len(ahead)}")
    for sha in forbidden:
        if subprocess_ok(repo, sha):
            problems.append(f"object {sha[:7]} exists in the sandbox")
    if git(repo, "rev-parse", "HEAD") != start_commit:
        problems.append("HEAD is not the start commit")
    if problems:
        raise SetupError("sandbox is not isolated: " + "; ".join(problems))


def subprocess_ok(repo, sha):
    return subprocess.run(["git", "-C", str(repo), "cat-file", "-e", sha], capture_output=True).returncode == 0


def build(private, out, pins=PINS):
    private, out = Path(private), Path(out)
    try:
        commits = gitutil.resolve(private, pins)
    except GitError as error:
        raise SetupError(str(error))
    check_output_folder(out, private)
    repo, task = out / "repo", out / "task"
    task.mkdir(parents=True)
    repo.mkdir()
    git(repo, "init", "--quiet", "--initial-branch=main")
    git(repo, "fetch", "--quiet", "--no-tags", str(private.resolve()), f"refs/tags/{pins['start']['tag']}")
    git(repo, "update-ref", "refs/heads/main", commits["start"])
    git(repo, "reset", "--quiet", "--hard", "main")
    for name in TASK_FILES:
        data = git(private, "show", f"{pins['fixtures']['tag']}:{name}", binary=True)
        (task / name).write_bytes(data)
    forbidden = [commits["anchor-x"], commits["anchor-y"], commits["fixtures"]]
    check_isolation(repo, forbidden, commits["start"])
    return {"repo": repo, "task": task, "start": commits["start"]}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("private", help="local clone of the private repository")
    ap.add_argument("out", help="new, empty output folder")
    args = ap.parse_args(argv)
    try:
        made = build(args.private, args.out)
    except SetupError as error:
        print(f"setup refused: {error}", file=sys.stderr)
        return 2
    print(f"Sandbox ready. Start commit {made['start'][:7]}.")
    print(f"  repo: {made['repo']}  (branch main, no remote)")
    print(f"  task: {made['task']}  (ISSUE.md, PROMPT.md; outside the repo)")
    print("\nNext steps:")
    print(f"  1. Start the harness under test in {made['repo']} with no GitHub credentials.")
    print(f"  2. Give it the contents of {made['task'] / 'PROMPT.md'} as the prompt; it may read {made['task'] / 'ISSUE.md'}.")
    print("  3. Do not intervene. Record the run details listed in README.md.")
    print("  4. When it stops, check the work is committed on branch `candidate`, then score it:")
    print(f"     python benchmarks/attention-rewrite/score.py --private {args.private} --candidate {made['repo']} --ref candidate --out <folder outside both repos>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
