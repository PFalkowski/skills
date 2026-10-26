"""HTTP parity: send the same scripted requests to the Python reference and the candidate, then diff.

Each server runs on 127.0.0.1 port 0 with its own temporary database. Expected answers
come from running the reference live; nothing is embedded.
"""
import hashlib
import http.client
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
SEC_HEADERS = ["content-type", "cache-control", "x-content-type-options", "content-security-policy"]
EXTRA_HEADERS = ["server", "x-frame-options", "referrer-policy", "connection", "transfer-encoding"]
ID_PLACEHOLDER = re.compile(r"<id\d+>")


def send(port, method, path, headers=None, body=None, host="default", chunked=False):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    if host == "default":
        conn.putheader("Host", f"127.0.0.1:{port}")
    elif host is not None:
        conn.putheader("Host", host.replace("{port}", str(port)))
    for key, value in (headers or {}).items():
        conn.putheader(key, value.replace("{port}", str(port)))
    if body is not None and not chunked and "Content-Length" not in (headers or {}):
        conn.putheader("Content-Length", str(len(body)))
    if chunked:
        conn.putheader("Transfer-Encoding", "chunked")
    conn.endheaders()
    if body is not None:
        if chunked:
            conn.send(f"{len(body):x}\r\n".encode() + body + b"\r\n0\r\n\r\n")
        else:
            conn.send(body)
    try:
        response = conn.getresponse()
        data = response.read()
        result = {"status": response.status, "headers": {k.lower(): v for k, v in response.getheaders()}, "raw": data}
    except Exception as error:  # connection reset, protocol error
        result = {"status": f"EXC {type(error).__name__}: {error}", "headers": {}, "raw": b""}
    conn.close()
    return result


def normalize(value, ids):
    if isinstance(value, dict):
        return {k: ("<t>" if k in ("time", "created") and isinstance(v, (int, float)) else normalize(v, ids)) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v, ids) for v in value]
    if isinstance(value, str):
        return UUID.sub(lambda m: ids.setdefault(m.group(), f"<id{len(ids) + 1}>"), value)
    return value


def J(obj):
    return json.dumps(obj).encode()


ORIGIN = "http://127.0.0.1:{port}"
JSONCT = {"Content-Type": "application/json"}


def script(port, run):
    """Yield (name, request kwargs). `run` lets later steps use earlier responses."""
    get = lambda p, **kw: dict(method="GET", path=p, **kw)
    post = lambda p, body, headers=None, **kw: dict(method="POST", path=p, body=body, headers=headers if headers is not None else dict(JSONCT), **kw)
    steps = [
        ("GET /", get("/")), ("GET /app.js", get("/app.js")), ("GET /style.css", get("/style.css")),
        ("GET /api/state empty", get("/api/state")), ("GET /index.html", get("/index.html")),
        ("GET /manifest.json", get("/manifest.json")), ("GET /nope", get("/nope")),
        ("GET /api/state?x=1", get("/api/state?x=1")), ("GET /?x=1", get("/?x=1")), ("GET /app.js?v=2", get("/app.js?v=2")),
        ("GET /../server.py", get("/../server.py")), ("GET /%2e%2e/inbox.py", get("/%2e%2e/inbox.py")),
        ("GET /API/STATE case", get("/API/STATE")), ("GET //api/state", get("//api/state")),
        ("GET Host localhost", get("/", host="localhost:{port}")), ("GET Host evil", get("/api/state", host="evil.example")),
        ("GET Host no port", get("/", host="127.0.0.1")), ("GET Host missing", get("/", host=None)),
        ("GET Host wrong port", get("/", host="127.0.0.1:1")), ("GET Host [::1]", get("/", host="[::1]:{port}")),
        ("GET Host uppercase-ish", get("/", host="127.0.0.1:{port}.")),
        ("HEAD /", dict(method="HEAD", path="/")), ("PUT /api/state", dict(method="PUT", path="/api/state", body=b"{}", headers=dict(JSONCT))),
        ("DELETE /", dict(method="DELETE", path="/")), ("OPTIONS /api/submit", dict(method="OPTIONS", path="/api/submit", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})),
        ("PATCH /api/action", dict(method="PATCH", path="/api/action", body=b"{}", headers=dict(JSONCT))),
        ("BREW /", dict(method="BREW", path="/")),
        ("POST / (static path)", post("/", J({}))),
        ("POST /api/state", post("/api/state", J({}))),
        ("POST /api/nope valid body", post("/api/nope", J({}))),
        ("POST /api/nope empty body", post("/api/nope", b"")),
        ("POST /api/submit?x=1", post("/api/submit?x=1", J({"text": "q", "key": "q"}))),
        # origin / host on POST
        ("POST Origin evil", post("/api/submit", J({"text": "x", "key": "o1"}), {**JSONCT, "Origin": "http://evil.example"})),
        ("POST Origin localhost", post("/api/submit", J({"text": "x", "key": "o2"}), {**JSONCT, "Origin": "http://localhost:{port}"})),
        ("POST Origin null", post("/api/submit", J({"text": "x", "key": "o3"}), {**JSONCT, "Origin": "null"})),
        ("POST Origin trailing slash", post("/api/submit", J({"text": "x", "key": "o4"}), {**JSONCT, "Origin": "http://127.0.0.1:{port}/"})),
        ("POST Origin https", post("/api/submit", J({"text": "x", "key": "o5"}), {**JSONCT, "Origin": "https://127.0.0.1:{port}"})),
        ("POST Origin empty", post("/api/submit", J({"text": "x", "key": "o6"}), {**JSONCT, "Origin": ""})),
        ("POST Host evil", post("/api/submit", J({"text": "x", "key": "h1"}), host="evil.example")),
        ("POST Host localhost", post("/api/submit", J({"text": "x", "key": "h2"}), host="localhost:{port}")),
        ("POST Sec-Fetch-Site cross-site", post("/api/submit", J({"text": "x sfs", "key": "sfs"}), {**JSONCT, "Sec-Fetch-Site": "cross-site"})),
        # content type
        ("POST CT text/plain", post("/api/submit", J({"text": "x", "key": "c1"}), {"Content-Type": "text/plain"})),
        ("POST CT missing", post("/api/submit", J({"text": "x", "key": "c2"}), {})),
        ("POST CT json+charset", post("/api/submit", J({"text": "ct charset", "key": "c3"}), {"Content-Type": "application/json; charset=utf-8"})),
        ("POST CT Application/JSON", post("/api/submit", J({"text": "ct case", "key": "c4"}), {"Content-Type": "Application/JSON"})),
        ("POST CT application/json-patch", post("/api/submit", J({"text": "x", "key": "c5"}), {"Content-Type": "application/jsonx"})),
        ("POST CT form", post("/api/submit", b"text=x&key=c6", {"Content-Type": "application/x-www-form-urlencoded"})),
        # sizes
        ("POST empty body", post("/api/submit", b"")),
        ("POST no body no length", dict(method="POST", path="/api/submit", headers=dict(JSONCT))),
        ("POST 16384 bytes", post("/api/submit", J({"text": "s", "key": "big", "pad": "a" * (16384 - len(J({"text": "s", "key": "big", "pad": ""})))}))),
        ("POST 16385 bytes", post("/api/submit", J({"text": "s", "key": "big2", "pad": "a" * (16385 - len(J({"text": "s", "key": "big2", "pad": ""})))}))),
        ("POST 1MB", post("/api/submit", b"{\"pad\":\"" + b"a" * 1_000_000 + b"\"}")),
        ("POST chunked", post("/api/submit", J({"text": "chunked", "key": "ch"}), chunked=True)),
        ("POST Content-Length abc", post("/api/submit", b"{}", {**JSONCT, "Content-Length": "abc"})),
        ("POST Content-Length -1", post("/api/submit", b"", {**JSONCT, "Content-Length": "-1"})),
        # body shape
        ("POST malformed JSON", post("/api/submit", b"{")),
        ("POST trailing garbage", post("/api/submit", b"{\"text\":\"tg\",\"key\":\"tg\"} x")),
        ("POST duplicate keys", post("/api/submit", b"{\"text\":\"first\",\"key\":\"dup\",\"text\":\"Build second\"}")),
        ("POST invalid UTF-8", post("/api/submit", b"{\"text\":\"\xff\xfe bad\",\"key\":\"u8\"}")),
        ("POST UTF-8 BOM", post("/api/submit", b"\xef\xbb\xbf{\"text\":\"bom\",\"key\":\"bom\"}")),
        ("POST lone surrogate escape", post("/api/submit", b"{\"text\":\"a\\ud800b\",\"key\":\"sur\"}")),
        ("POST array", post("/api/submit", b"[]")), ("POST string", post("/api/submit", b"\"s\"")),
        ("POST null", post("/api/submit", b"null")), ("POST number", post("/api/submit", b"1")),
        ("POST NaN literal", post("/api/submit", b"{\"text\":\"n\",\"key\":\"nan\",\"x\":NaN}")),
        ("POST comment", post("/api/submit", b"{/*c*/\"text\":\"cm\",\"key\":\"cm\"}")),
        ("POST text number", post("/api/submit", J({"text": 1, "key": "k"}))),
        ("POST key missing", post("/api/submit", J({"text": "a"}))),
        ("POST key number", post("/api/submit", J({"text": "a", "key": 5}))),
        ("POST key empty", post("/api/submit", J({"text": "a", "key": ""}))),
        ("POST text blank", post("/api/submit", J({"text": "   \t\n ", "key": "blank"}))),
        ("POST text NBSP only", post("/api/submit", J({"text": "  ", "key": "nbsp"}))),
        ("POST text 2000 ascii", post("/api/submit", J({"text": "b" * 2000, "key": "a2000"}))),
        ("POST text 2001 ascii", post("/api/submit", J({"text": "b" * 2001, "key": "a2001"}))),
        ("POST text 2000 + spaces", post("/api/submit", J({"text": "  " + "c" * 2000 + "  ", "key": "a2000s"}))),
        ("POST text 2000 emoji", post("/api/submit", J({"text": "\U0001F600" * 2000, "key": "e2000"}))),
        ("POST text 2001 emoji", post("/api/submit", J({"text": "\U0001F600" * 2001, "key": "e2001"}))),
        ("POST text 1001 emoji", post("/api/submit", J({"text": "\U0001F600" * 1001, "key": "e1001"}))),
        ("POST text 2000 emoji raw utf8", post("/api/submit", json.dumps({"text": "\U0001F600" * 2000, "key": "e2000r"}, ensure_ascii=False).encode())),
        ("POST text combining 2000", post("/api/submit", J({"text": "é" * 1000, "key": "comb"}))),
        # routing / workflow
        ("submit whats-next idea", post("/api/submit", J({"text": "Add a gamification idea to whats-next", "key": "w1"}))),
        ("submit same key again", post("/api/submit", J({"text": "different text", "key": "w1"}))),
        ("submit attention coding", post("/api/submit", J({"text": "Build a durable inbox for Attention", "key": "w2"}))),
        ("submit workspace cleanup", post("/api/submit", J({"text": "Clean up unneeded worktrees", "key": "w3"}))),
        ("submit ambiguous", post("/api/submit", J({"text": "Move inbox ideas into whats-next", "key": "w4"}))),
        ("submit no project", post("/api/submit", J({"text": "Something unrelated", "key": "w5"}))),
        ("submit uppercase alias", post("/api/submit", J({"text": "WHAT'S NEXT backlog TICKET", "key": "w6"}))),
        ("submit Turkish I", post("/api/submit", J({"text": "İNBOX fix", "key": "w7"}))),
        ("submit extra fields", post("/api/submit", J({"text": "Attention extra", "key": "w8", "id": "forced", "state": "completed"}))),
    ]
    for step in steps:
        yield step
    ids = run["ids"]
    act = lambda name, body: (name, post("/api/action", J(body)))
    yield act("action unknown id", {"id": "nope", "action": "advance"})
    yield act("action id number", {"id": 1, "action": "advance"})
    yield act("action missing action", {"id": ids.get("w2", "x")})
    yield act("action bogus", {"id": ids.get("w2", "x"), "action": "explode"})
    yield act("action pause queued", {"id": ids.get("w2", "x"), "action": "pause"})
    yield act("action resume", {"id": ids.get("w2", "x"), "action": "resume"})
    yield act("action advance (running→ckpt)", {"id": ids.get("w2", "x"), "action": "advance"})
    yield act("primary stale expectedState", {"id": ids.get("w2", "x"), "action": "primary", "expectedState": "queued"})
    yield act("primary expectedState number", {"id": ids.get("w2", "x"), "action": "primary", "expectedState": 3})
    yield act("primary expectedState null", {"id": ids.get("w2", "x"), "action": "primary", "expectedState": None})
    yield act("primary matching expectedState", {"id": ids.get("w2", "x"), "action": "primary", "expectedState": "running"})
    yield act("interrupt", {"id": ids.get("w2", "x"), "action": "interrupt"})
    yield act("primary on failed (retry)", {"id": ids.get("w2", "x"), "action": "primary"})
    yield act("cancel needs-input", {"id": ids.get("w5", "x"), "action": "cancel"})
    yield act("cancel canceled again", {"id": ids.get("w5", "x"), "action": "cancel"})
    yield act("resolve bad project", {"id": ids.get("w4", "x"), "action": "resolve", "project": "nope"})
    yield act("resolve project number", {"id": ids.get("w4", "x"), "action": "resolve", "project": 7})
    yield act("resolve good", {"id": ids.get("w4", "x"), "action": "resolve", "project": "workspace"})
    yield act("resolve again (not needs-input)", {"id": ids.get("w4", "x"), "action": "resolve", "project": "attention"})
    yield act("primary on needs-input", {"id": ids.get("w6", "x"), "action": "primary"})
    yield ("configure bad agent", post("/api/configure", J({"project": "attention", "agent": "Me"})))
    yield ("configure bad project", post("/api/configure", J({"project": "nope", "agent": "Codex"})))
    yield ("configure missing", post("/api/configure", J({})))
    yield ("configure Codex", post("/api/configure", J({"project": "attention", "agent": "Codex"})))
    yield act("continue handoff", {"id": ids.get("w2", "x"), "action": "continue"})
    for n in range(6):
        yield act(f"advance w1 #{n}", {"id": ids.get("w1", "x"), "action": "advance"})
    yield act("advance completed", {"id": ids.get("w1", "x"), "action": "advance"})
    yield act("cancel completed", {"id": ids.get("w1", "x"), "action": "cancel"})
    yield act("primary completed (wrap-up)", {"id": ids.get("w1", "x"), "action": "primary"})
    yield act("primary archived", {"id": ids.get("w1", "x"), "action": "primary"})
    yield ("demo", post("/api/demo", J({})))
    yield ("demo again", post("/api/demo", J({})))
    yield ("demo empty body", post("/api/demo", b""))
    yield ("GET /api/state final", get("/api/state"))


def run_server(name, cwd, tokens, db, out_dir, skip=()):
    server = common.start(cwd, tokens, db, out_dir / f"{name}.server.log")
    results, run, id_map = [], {"ids": {}}, {}
    try:
        for case, kwargs in script(server.port, run):
            if case in skip:
                continue
            r = send(server.port, **kwargs)
            text = r["raw"]
            try:
                parsed = json.loads(text) if text else None
                if isinstance(parsed, dict) and "id" in parsed and kwargs.get("path") == "/api/submit":
                    key = json.loads(kwargs["body"]).get("key") if kwargs.get("body") else None
                    if key:
                        run["ids"].setdefault(key, parsed["id"])
                body = {"json": normalize(parsed, id_map)}
            except Exception:
                body = {"sha256": hashlib.sha256(text).hexdigest()[:16], "len": len(text), "head": text[:120].decode("utf-8", "replace")}
            results.append({"case": case, "status": r["status"], "headers": {h: r["headers"].get(h) for h in SEC_HEADERS + EXTRA_HEADERS}, "body": body})
    finally:
        common.stop(server)
    return results


def _blur_ids(results):
    return json.loads(ID_PLACEHOLDER.sub("<id>", json.dumps(results)))


def compare(reference, other):
    """Count differences against the reference. Both lists hold run_server results in script order."""
    ref, oth = _blur_ids(reference), _blur_ids(other)
    if [r["case"] for r in ref] != [o["case"] for o in oth]:
        raise ValueError("result lists do not hold the same cases in the same order")
    status = body = headers = 0
    rows = []
    for p, o in zip(ref, oth):
        s = o["status"] != p["status"]
        b = o["body"] != p["body"]
        h = [x for x in SEC_HEADERS if o["headers"].get(x) != p["headers"].get(x)]
        status, body, headers = status + s, body + b, headers + bool(h)
        if s or b or h:
            rows.append({"case": p["case"], "ref_status": p["status"], "status": o["status"], "body_differs": b, "headers_differ": h})
    return {"cases": len(ref), "status_differs": status, "body_differs": body, "headers_differ": headers,
            "server_headers": sorted({str(o["headers"].get("server")) for o in other}),
            "reference_server_headers": sorted({str(p["headers"].get("server")) for p in reference}),
            "rows": rows}


def field_diffs(reference, other):
    """Field-level differences inside responses where both sides answered 200 with different JSON."""
    ref, oth = _blur_ids(reference), _blur_ids(other)
    found = []

    def walk(case, a, b, path):
        if type(a) is not type(b):
            found.append({"case": case, "path": path, "reference": repr(a)[:90], "candidate": repr(b)[:90]})
        elif isinstance(a, dict):
            for k in sorted(set(a) | set(b)):
                walk(case, a.get(k, "<missing>"), b.get(k, "<missing>"), path + "." + k)
        elif isinstance(a, list):
            if len(a) != len(b):
                found.append({"case": case, "path": path, "reference": f"len {len(a)}", "candidate": f"len {len(b)}"})
                return
            for i, (x, y) in enumerate(zip(a, b)):
                walk(case, x, y, f"{path}[{i}]")
        elif a != b:
            found.append({"case": case, "path": path, "reference": repr(a)[:90], "candidate": repr(b)[:90]})

    for p, o in zip(ref, oth):
        if p["status"] == o["status"] == 200 and p["body"] != o["body"] and "final" not in p["case"]:
            walk(p["case"], p["body"], o["body"], "")
    return found


STALE_STEPS = ["advance", "primary with a stale expectedState", "advance", "submit", "configure"]


def stale_repro(cwd, tokens, db, out_dir, name):
    """Submit, advance, a stale primary, advance, submit, configure. Returns the five later statuses."""
    server = common.start(cwd, tokens, db, out_dir / f"{name}.stale.log")
    try:
        port = server.port
        post = lambda path, obj: send(port, "POST", path, headers=dict(JSONCT), body=J(obj))
        item = json.loads(post("/api/submit", {"text": "Build a durable inbox for Attention", "key": "k"})["raw"])
        statuses = [
            post("/api/action", {"id": item["id"], "action": "advance"})["status"],
            post("/api/action", {"id": item["id"], "action": "primary", "expectedState": "queued"})["status"],
            post("/api/action", {"id": item["id"], "action": "advance"})["status"],
            post("/api/submit", {"text": "another", "key": "k2"})["status"],
            post("/api/configure", {"project": "attention", "agent": "Codex"})["status"],
        ]
        return statuses
    finally:
        common.stop(server)


def run_parity(reference, candidate, out_dir):
    """reference and candidate are (cwd, tokens). Writes results to out_dir and returns the summary."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for name, (cwd, tokens) in (("reference", reference), ("candidate", candidate)):
        db = out_dir / f"{name}.db"
        if db.exists():
            db.unlink()
        results[name] = run_server(name, cwd, tokens, db, out_dir)
        (out_dir / f"{name}.results.json").write_text(json.dumps(results[name], indent=1, ensure_ascii=True), encoding="utf-8")
    summary = compare(results["reference"], results["candidate"])
    summary["field_diffs"] = field_diffs(results["reference"], results["candidate"])
    stale = {}
    for name, (cwd, tokens) in (("reference", reference), ("candidate", candidate)):
        stale[name] = stale_repro(cwd, tokens, out_dir / f"{name}.stale.db", out_dir, name)
    summary["stale_guard"] = {"steps": STALE_STEPS, **stale}
    return summary
