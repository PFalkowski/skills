"""Database compatibility: a reader server opens a copy of the writer's database.

The reader must show the same items in the same order, keep the agent binding, give a
re-submitted key the same id, run an action, and keep old ids after a new submit. Only the
databases that the parity run wrote (temporary files) are used.
"""
import json
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from parity import JSONCT, run_server, send

OPEN_STATES = ("queued", "running", "paused", "failed")
CHECKS = ("items_same_ids_and_order", "agent_binding_kept", "same_key_same_id", "action_works",
          "old_ids_kept", "schema_unchanged")


def _connect(db):
    return sqlite3.connect(f"file:{db}?mode=ro", uri=True)


def schema(db):
    c = _connect(db)
    try:
        return c.execute("SELECT type, name, sql FROM sqlite_master ORDER BY name").fetchall()
    finally:
        c.close()


def snapshot(db):
    c = _connect(db)
    try:
        rows = c.execute("SELECT id, request_key, json_extract(body,'$.state'), json_extract(body,'$.checkpoint') FROM items ORDER BY rowid").fetchall()
        agents = c.execute("SELECT project, agent FROM project_agents").fetchall()
    finally:
        c.close()
    return rows, agents


def check_pair(writer_db, reader, work_dir, label):
    """reader is (cwd, tokens). Returns a dict of yes/no checks plus the facts behind them."""
    work = Path(tempfile.mkdtemp(dir=str(work_dir)))
    db = work / "copy.db"
    shutil.copy(writer_db, db)
    result = {"pair": label}
    try:
        before, agents = snapshot(db)
        target = next((r for r in before if r[2] in OPEN_STATES), None)
        known = next((r for r in before if r[1] == "w2"), before[0] if before else None)
        if known is None or target is None:
            raise RuntimeError("the writer database has no item to test with")
        server = common.start(reader[0], reader[1], db, work / "log.txt")
        try:
            port = server.port
            post = lambda path, obj: send(port, "POST", path, headers=dict(JSONCT), body=json.dumps(obj).encode())
            state = send(port, "GET", "/api/state")
            st = json.loads(state["raw"])
            ids_read = [i["id"] for i in st["items"]][::-1]
            resub = post("/api/submit", {"text": "anything", "key": known[1]})
            resub_id = json.loads(resub["raw"]).get("id")
            act = post("/api/action", {"id": target[0], "action": "primary", "expectedState": target[2]})
            acted = json.loads(act["raw"])
            new = post("/api/submit", {"text": "Fresh after cross-open", "key": f"cross-{label}"})
        finally:
            common.stop(server)
        after, _ = snapshot(db)
        bound = all(st.get("projects", {}).get(project, {}).get("agent") == agent for project, agent in agents)
        result.update({
            "items_same_ids_and_order": state["status"] == 200 and ids_read == [r[0] for r in before],
            "agent_binding_kept": state["status"] == 200 and bound,
            "same_key_same_id": resub["status"] == 200 and resub_id == known[0],
            "action_works": act["status"] == 200 and isinstance(acted, dict) and "state" in acted,
            "old_ids_kept": new["status"] == 200 and [r[0] for r in after[:len(before)]] == [r[0] for r in before],
            "schema_unchanged": schema(db) == schema(writer_db),
            "facts": {"state_status": state["status"], "items_in_db": len(before), "items_read": len(st.get("items", [])),
                      "action": f"{target[2]} -> {acted.get('state', acted) if isinstance(acted, dict) else acted}",
                      "rows_after": len(after)},
        })
    except Exception as error:
        result.update({c: False for c in CHECKS})
        result["error"] = f"{type(error).__name__}: {error}"
    return result


LONE_SURROGATE_CASE = "POST lone surrogate escape"


def lone_surrogate_state(writer_db, reader, work_dir):
    """Status of GET /api/state when the reader opens a database holding the lone-surrogate item."""
    work = Path(tempfile.mkdtemp(dir=str(work_dir)))
    db = work / "copy.db"
    shutil.copy(writer_db, db)
    server = common.start(reader[0], reader[1], db, work / "log.txt")
    try:
        return send(server.port, "GET", "/api/state")["status"]
    finally:
        common.stop(server)


def run_dbcompat(reference, candidate, parity_dir, work_dir):
    """Write a fresh database with each server, then cross-open them in both directions.

    The writer script skips the lone-surrogate request, which poisons a database for any
    reader. That edge case is reported on its own under lone_surrogate_state_status.
    """
    parity_dir, work_dir = Path(parity_dir), Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    dbs = {}
    for name, (cwd, tokens) in (("reference", reference), ("candidate", candidate)):
        dbs[name] = work_dir / f"{name}.db"
        run_server(name, cwd, tokens, dbs[name], work_dir, skip=(LONE_SURROGATE_CASE,))
    return {
        "schemas_equal": schema(dbs["reference"]) == schema(dbs["candidate"]),
        "reference_to_candidate": check_pair(dbs["reference"], candidate, work_dir, "reference-to-candidate"),
        "candidate_to_reference": check_pair(dbs["candidate"], reference, work_dir, "candidate-to-reference"),
        "lone_surrogate_state_status": {
            "reference_database_read_by_candidate": lone_surrogate_state(parity_dir / "reference.db", candidate, work_dir),
            "reference_database_read_by_reference": lone_surrogate_state(parity_dir / "reference.db", reference, work_dir),
        },
    }


def all_yes(dbcompat):
    return all(dbcompat[k].get(c) for k in ("reference_to_candidate", "candidate_to_reference") for c in CHECKS)
