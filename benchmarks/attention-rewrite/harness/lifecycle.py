"""Lifecycle: Ctrl+C (a Windows console event) or SIGINT (POSIX) stops the server, and an in-flight request completes.

"In flight" means the request headers and part of the body go out before the signal and the
rest after it. On Windows a real CTRL_C_EVENT goes to the console the server owns; launch.py
first re-enables Ctrl+C there, because an agent's process tree often has it disabled.
"""
import json
import re
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common

WINDOWS = common.WINDOWS
HELPER = common.HARNESS / "ctrlc.py"
BODY = {"text": "In flight during shutdown", "key": "inflight"}


def interrupt(process):
    if WINDOWS:
        return subprocess.run([sys.executable, "-I", str(HELPER), str(process.pid)], capture_output=True, text=True).returncode
    process.send_signal(signal.SIGINT)
    return 0


def wait_exit(server, timeout=15):
    t0 = time.monotonic()
    try:
        code = server.process.wait(timeout)
        return code, round(time.monotonic() - t0, 2)
    except subprocess.TimeoutExpired:
        common.kill_tree(server.process)
        return "did not exit (killed)", timeout


def read_response(sock):
    sock.settimeout(10)
    data = b""
    try:
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            data += chunk
            head, _, body = data.partition(b"\r\n\r\n")
            m = re.search(rb"Content-Length: *(\d+)", head, re.I)
            if m and len(body) >= int(m.group(1)):
                break
    except Exception as error:
        return f"EXC {type(error).__name__}: {error}", data
    return data.split(b"\r\n", 1)[0].decode(errors="replace") if data else "no response (connection closed)", data


def run(name, cwd, tokens, out):
    rows = []
    out = Path(out)
    with tempfile.TemporaryDirectory() as d:
        db = Path(d) / "l.db"
        server = common.start(cwd, tokens, db, out / f"{name}.idle.log", console=True)
        try:
            rc = interrupt(server.process)
            code, secs = wait_exit(server)
        finally:
            common.stop(server)
        tail = Path(out / f"{name}.idle.log").read_text(encoding="utf-8", errors="replace").strip().splitlines()[-1:]
        rows.append({"case": "idle interrupt", "helper": rc, "exit": code, "seconds": secs, "last log line": tail})

        server = common.start(cwd, tokens, db, out / f"{name}.inflight.log", console=True)
        sock = None
        try:
            body = json.dumps(BODY).encode()
            sock = socket.create_connection(("127.0.0.1", server.port))
            sock.sendall(f"POST /api/submit HTTP/1.1\r\nHost: 127.0.0.1:{server.port}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body[:10])
            time.sleep(0.5)
            rc = interrupt(server.process)
            time.sleep(0.5)
            alive_mid = server.process.poll() is None
            try:
                sock.sendall(body[10:])
                status, _ = read_response(sock)
            except Exception as error:
                status = f"EXC {type(error).__name__}: {error}"
            sock.close()
            code, secs = wait_exit(server)
            try:
                socket.create_connection(("127.0.0.1", server.port), timeout=2).close()
                after = "port still accepting"
            except OSError:
                after = "port closed"
        finally:
            if sock:
                sock.close()
            common.stop(server)
        rows.append({"case": "in-flight request", "helper": rc, "alive 0.5s after signal": alive_mid, "response": status,
                     "exit": code, "seconds": secs, "after exit": after})

        server = common.start(cwd, tokens, db, out / f"{name}.restart.log", console=True)
        try:
            sock = socket.create_connection(("127.0.0.1", server.port))
            sock.sendall(f"GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:{server.port}\r\nConnection: close\r\n\r\n".encode())
            _, raw = read_response(sock)
            sock.close()
        finally:
            common.stop(server)
        rows.append({"case": "after restart", "in-flight item persisted": BODY["text"].encode() in raw})
    return rows


def verdict(rows):
    """Reduce the three rows to the table the report uses."""
    idle, flight, restart = rows
    stopped = not str(idle["exit"]).startswith("did not exit")
    exited = not str(flight["exit"]).startswith("did not exit")
    return {
        "stops_when_idle": stopped,
        "idle_exit_code": idle["exit"] if stopped else None,
        "in_flight_response": flight["response"],
        "exits_with_request_in_flight": exited,
        "in_flight_item_saved": bool(restart["in-flight item persisted"]),
    }


def run_lifecycle(reference, candidate, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    result = {}
    for name, (cwd, tokens) in (("reference", reference), ("candidate", candidate)):
        rows = run(name, cwd, tokens, out)
        result[name] = {"rows": rows, **verdict(rows)}
    return result
