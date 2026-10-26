"""Mechanical scorer for one candidate.

    python benchmarks/attention-rewrite/score.py --private <private-clone> \\
        --candidate <folder> [--ref <git ref>] --out <new folder outside both repos>

Builds the candidate, runs its tests, then compares it with the Python reference at the
start tag: scripted HTTP parity, database compatibility and lifecycle. Writes scorecard.json
and scorecard.md into --out. Servers listen on 127.0.0.1 port 0 with temporary databases.
No real database is ever opened. Every process it starts is stopped on exit.
"""
import argparse
import json
import shlex
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))
import buildtest
import common
import dbcompat
import gitutil
import lifecycle
import parity
import scorecard


class ScoreError(Exception):
    pass


def candidate_tokens(root, override, out_dir, build_ok):
    """Return (tokens, description, skip reason). tokens always ends with the port and database options."""
    if override:
        tokens = shlex.split(override, posix=not common.WINDOWS)
        if not any("{db}" in t for t in tokens):
            raise ScoreError("--candidate-cmd must contain {db} so the server gets a temporary database")
        return tokens, f"override: {override}", None
    try:
        project, dll = buildtest.find_host(root)
    except buildtest.DiscoveryError as error:
        return None, None, str(error)
    rel = project.relative_to(root).as_posix()
    if dll is None:
        return None, None, f"host project {rel} has no Debug build output"
    return ["dotnet", str(dll), "--port", "0", "--database", "{db}"], f"{rel} -> {dll.relative_to(root).as_posix()}", None


def check_out(out, root, private):
    out = Path(out).resolve()
    for guarded, what in ((root, "the candidate"), (private, "the private clone")):
        g = Path(guarded).resolve()
        if out == g or g in out.parents:
            raise ScoreError(f"--out {out} is inside {what}; use a folder outside both repositories")
    if out.exists() and any(out.iterdir()):
        raise ScoreError(f"--out {out} is not empty")
    out.mkdir(parents=True, exist_ok=True)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--private", help="local clone of the private repository (source of the Python reference)")
    ap.add_argument("--reference-dir", help="an already extracted start-tag tree, instead of --private")
    ap.add_argument("--candidate", required=True, help="candidate folder; with --ref, a git repository")
    ap.add_argument("--ref", help="git ref in --candidate to score; it is exported to a clean folder first")
    ap.add_argument("--out", required=True, help="new folder for logs and the scorecard")
    ap.add_argument("--label", help="name for the scorecard (default: candidate folder name)")
    ap.add_argument("--candidate-cmd", help="server command with {db}, e.g. \"dotnet bin/App.dll --port 0 --database {db}\"")
    ap.add_argument("--docker", action="store_true", help="also run dotnet test and node --check in Docker containers")
    ap.add_argument("--allow-ancestor-props", action="store_true", help="build even if a parent folder holds MSBuild or global.json files")
    ap.add_argument("--skip-lifecycle", action="store_true", help="skip the Ctrl+C / SIGINT checks")
    args = ap.parse_args(argv)
    if not (args.private or args.reference_dir):
        ap.error("give --private or --reference-dir")
    candidate = Path(args.candidate).resolve()
    private = Path(args.private).resolve() if args.private else Path(args.reference_dir).resolve()
    try:
        out = check_out(args.out, candidate, private)
        pins = gitutil.resolve(private) if args.private else {}
        card = {"label": args.label or candidate.name, "pins": pins, "environment": scorecard.environment(), "skipped": {}}
        if args.private:
            ref_dir = gitutil.archive(private, gitutil.PINS["start"]["tag"], out / "reference")
        else:
            ref_dir = private
        if args.ref:
            root = gitutil.archive(candidate, args.ref, out / "candidate-src")
            card["candidate_source"] = f"{candidate} at {args.ref} ({gitutil.git(candidate, 'rev-parse', '--short', args.ref)})"
        else:
            root = candidate
            card["candidate_source"] = str(candidate)
        inherited = buildtest.ancestor_build_files(root)
        if inherited and not args.allow_ancestor_props:
            raise ScoreError(f"parent folders hold files that change the build: {[str(p) for p in inherited]}. "
                             "Score a folder outside any other checkout (use --ref to export one), or pass --allow-ancestor-props.")
        card["tests"] = buildtest.build_and_test(root, out, "local")
        if args.docker:
            card["docker"] = buildtest.docker_checks(root, out)
        else:
            card["skipped"]["docker"] = "not requested (--docker)"
        tokens, description, reason = candidate_tokens(root, args.candidate_cmd, out, card["tests"]["build"]["exit"] == 0)
        card["host"] = {"description": description or f"not found: {reason}"}
        if tokens is None:
            card["skipped"]["parity, database compatibility, lifecycle"] = reason
        else:
            reference = (str(ref_dir), [sys.executable, "server.py", "--port", "0", "--database", "{db}"])
            cand = (str(root), tokens)
            card["parity"] = parity.run_parity(reference, cand, out / "parity")
            card["dbcompat"] = dbcompat.run_dbcompat(reference, cand, out / "parity", out / "dbcompat")
            if args.skip_lifecycle:
                card["skipped"]["lifecycle"] = "skipped (--skip-lifecycle)"
            else:
                card["lifecycle"] = lifecycle.run_lifecycle(reference, cand, out / "lifecycle")
    except (ScoreError, gitutil.GitError, buildtest.DiscoveryError) as error:
        print(f"score refused: {error}", file=sys.stderr)
        return 2
    finally:
        common.kill_all()
    card["summary"] = scorecard.summarize(card)
    (out / "scorecard.json").write_text(json.dumps(card, indent=1, default=str), encoding="utf-8")
    (out / "scorecard.md").write_text(scorecard.render_markdown(card), encoding="utf-8")
    print(json.dumps(card["summary"], indent=1))
    print(f"scorecard: {out / 'scorecard.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
