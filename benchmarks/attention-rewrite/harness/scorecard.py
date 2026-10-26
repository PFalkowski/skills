"""Environment capture and scorecard rendering."""
import platform
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dbcompat import CHECKS


def _version(argv):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    out = (p.stdout or p.stderr).strip()
    return out.splitlines()[0] if p.returncode == 0 and out else None


def environment():
    return {
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "python": sys.version.split()[0],
        "dotnet_sdk": _version(["dotnet", "--version"]),
        "node": _version(["node", "--version"]) if shutil.which("node") else None,
        "docker": _version(["docker", "version", "--format", "{{.Server.Version}}"]) if shutil.which("docker") else None,
    }


def summarize(card):
    """Reduce a scorecard to the headline numbers the calibration table compares."""
    out = {}
    tests = card.get("tests", {})
    b = tests.get("build")
    if b:
        out["build_exit"] = b.get("exit")
        out["build_ok"] = bool(b.get("ok"))
    flags = ["build failed"] if b and not b.get("ok") else []
    t = tests.get("dotnet_test")
    if t:
        out["tests"] = f"{t['passed']} / {t['failed']} / {t['skipped']}"
        if not t.get("test_projects") or not t.get("total"):
            flags.append("no test projects ran")
    elif b:
        flags.append("no test projects ran")
    if flags:
        out["flags"] = flags
    p = card.get("parity")
    if p:
        out["parity"] = f"{p['status_differs']} / {p['body_differs']} / {p['headers_differ']}"
        stale = p.get("stale_guard", {})
        out["stale_guard_ok"] = bool(stale) and stale.get("candidate") == stale.get("reference")
    d = card.get("dbcompat")
    if d:
        out["dbcompat_all_yes"] = all(d[k].get(c) for k in ("reference_to_candidate", "candidate_to_reference") for c in CHECKS)
    life = card.get("lifecycle", {}).get("candidate")
    if life:
        out["lifecycle"] = ("stops, exit " + str(life["idle_exit_code"])) if life["stops_when_idle"] else "does not stop on interrupt"
        out["lifecycle_in_flight_exit"] = life["exits_with_request_in_flight"]
    return out


def _yes(v):
    return "yes" if v else "NO"


def render_markdown(card):
    L = [f"# Scorecard: {card['label']}", ""]
    pins = card.get("pins", {})
    for w in card.get("warnings", []):
        L += [f"**Warning:** {w}", ""]
    L += ["| Item | Value |", "|---|---|"]
    L += [f"| Candidate | {card.get('candidate_source')} |"]
    if card.get("candidate_commit"):
        L += [f"| Candidate commit | {card['candidate_commit']} ({card.get('candidate_pin') or 'not a pinned tag'}) |"]
    for name, sha in pins.items():
        L += [f"| Pin {name} | {sha} |"]
    for k, v in card.get("meta", {}).items():
        L += [f"| {k} | {v} |"]
    for k, v in card.get("environment", {}).items():
        L += [f"| {k} | {v} |"]
    L += [""]
    b = card.get("tests")
    if b and "error" in b:
        L += ["## Build and tests", "", f"Not run: {b['error']}", ""]
    elif b:
        L += ["## Build and tests", "", "| Check | Result |", "|---|---|"]
        L += [f"| Solution | {b['solution']} |"]
        bd = b["build"]
        L += [f"| Build | exit {bd['exit']}, {bd['warnings']} warnings, {bd['errors']} errors |"]
        if not bd.get("ok"):
            L += ["| Flag | **build failed** |"]
        t = b["dotnet_test"]
        L += [f"| dotnet test (pass / fail / skip) | {t['passed']} / {t['failed']} / {t['skipped']} in {t['test_projects']} test projects (exit {t['exit']}) |"]
        if not t["test_projects"] or not t["total"]:
            L += ["| Flag | **no test projects ran** |"]
        L += [f"| node --check app.js | {b['node_check']['status']} |"]
        dk = card.get("docker")
        if dk and dk.get("status") == "ran":
            dt = dk["dotnet_test"]
            L += [f"| Docker {dk['image']} (SDK {dk['sdk']}) | {dt['passed']} / {dt['failed']} / {dt['skipped']}, {dk['build']['warnings']} warnings; node {dk.get('node_check', {}).get('status', 'n/a')} |"]
        elif dk:
            L += [f"| Docker | {dk.get('status')}: {dk.get('reason', '')} |"]
        L += [""]
    h = card.get("host")
    if h:
        L += ["## Host", "", f"- {h.get('description')}", ""]
    p = card.get("parity")
    if p:
        L += ["## HTTP parity against the Python reference", "",
              f"{p['cases']} scripted requests ({p.get('counted', p['cases'])} counted). Status differs {p['status_differs']}, body differs {p['body_differs']}, security headers differ {p['headers_differ']}.",
              *([("Left out of the counts (the reference's own answer varies from run to run): " + "; ".join(f"{e['case']}: reference {e['reference_status'][:60]}, candidate {e['status'][:60]}" for e in p["excluded"]) + "."), ""] if p.get("excluded") else []),
              f"`Server` header values: {p['server_headers']} (reference: {p['reference_server_headers']}).", "",
              f"Field-level differences in answers that both sides gave with status 200: {len(p.get('field_diffs', []))}.", "",
              "Stale-guard repro (statuses for: " + ", ".join(p["stale_guard"]["steps"]) + "):", "",
              f"- reference {p['stale_guard']['reference']}", f"- candidate {p['stale_guard']['candidate']}", "",
              "| Case | Reference status | Candidate status | Body differs | Security headers differing |", "|---|---|---|---|---|"]
        L += [f"| {r['case']} | {r['ref_status']} | {r['status']} | {_yes(r['body_differs'])} | {', '.join(r['headers_differ']) or '-'} |" for r in p["rows"]]
        L += [""]
    d = card.get("dbcompat")
    if d:
        L += ["## Database compatibility", "", f"Schemas written by both servers are equal: {_yes(d['schemas_equal'])}.", "",
              "| Writer to reader | " + " | ".join(c.replace("_", " ") for c in CHECKS) + " |", "|---|" + "---|" * len(CHECKS)]
        for key in ("reference_to_candidate", "candidate_to_reference"):
            r = d[key]
            L += [f"| {r['pair']} | " + " | ".join("yes" if r.get(c) else "no" for c in CHECKS) + " |"]
            if r.get("error"):
                L += [f"|  | error: {r['error']} |"]
        ls = d.get("lone_surrogate_state_status")
        if ls:
            L += ["", f"Edge case: GET /api/state on a reference database that holds a lone-surrogate item answers {ls['reference_database_read_by_candidate']} in the candidate and {ls['reference_database_read_by_reference']} in the reference."]
        L += [""]
    life = card.get("lifecycle")
    if life:
        L += ["## Lifecycle (Ctrl+C on Windows, SIGINT elsewhere)", "",
              "| Server | Stops when idle | In-flight request | Exits with request in flight | In-flight item saved |", "|---|---|---|---|---|"]
        for name in ("reference", "candidate"):
            r = life[name]
            idle = f"yes, exit {r['idle_exit_code']}" if r["stops_when_idle"] else "NO, still running after 15 s"
            L += [f"| {name} | {idle} | {r['in_flight_response']} | {_yes(r['exits_with_request_in_flight'])} | {_yes(r['in_flight_item_saved'])} |"]
        L += [""]
    skipped = card.get("skipped")
    if skipped:
        L += ["## Not run", ""] + [f"- {k}: {v}" for k, v in skipped.items()] + [""]
    return "\n".join(L)
