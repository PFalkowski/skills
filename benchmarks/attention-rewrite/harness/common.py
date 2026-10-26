"""Shared helpers: server specs, process start and cleanup, database safety."""
import atexit
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

WINDOWS = os.name == "nt"
HARNESS = Path(__file__).resolve().parent
ADDRESS = re.compile(r"http://127\.0\.0\.1:(\d+)")
_STARTED = []
START_TIMEOUT = 60


class Server:
    def __init__(self, process, port, log):
        self.process, self.port, self.log = process, port, log


def parse_spec(spec):
    """Parse 'name=cwd::tok|tok|{db}' into (name, cwd, [tokens]). `{db}` is replaced at start."""
    if "=" not in spec or "::" not in spec:
        raise ValueError(f"bad server spec {spec!r}: expected name=cwd::cmd|token|...")
    name, rest = spec.split("=", 1)
    cwd, cmd = rest.split("::", 1)
    tokens = [t for t in cmd.split("|") if t]
    if not name or not cwd or not tokens:
        raise ValueError(f"bad server spec {spec!r}: name, cwd and command are all required")
    return name, cwd, tokens


def assert_safe_db(path):
    """Refuse any database path that could be a real working database."""
    p = Path(path)
    if ".data" in p.parts or p.name == "inbox.db":
        raise ValueError(f"refusing to use {p}: the harness only uses temporary databases")


def kill_tree(process):
    alive = process.poll() is None
    if not alive and not WINDOWS:
        return
    if WINDOWS:
        done = subprocess.run(["taskkill", "/T", "/F", "/PID", str(process.pid)], capture_output=True, text=True)
        if done.returncode != 0 and alive:
            print(f"taskkill of {process.pid} exited {done.returncode}: {done.stderr.strip()}", file=sys.stderr)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            process.kill()
    try:
        process.wait(10)
    except subprocess.TimeoutExpired:
        pass


def kill_all():
    while _STARTED:
        kill_tree(_STARTED.pop())


atexit.register(kill_all)


def _forget(process):
    if process in _STARTED:
        _STARTED.remove(process)


def start(cwd, tokens, db, log_path, console=False):
    """Start a server on 127.0.0.1 port 0 and return a Server once it prints its address.

    console=True (Windows only) runs it in its own hidden console behind launch.py, so a
    real Ctrl+C can be sent to it. The process is registered for cleanup either way.
    """
    assert_safe_db(db)
    log = open(log_path, "w", encoding="utf-8")
    argv = [t.replace("{db}", str(db)) for t in tokens]
    kwargs = {}
    if console and WINDOWS:
        info = subprocess.STARTUPINFO()
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        info.wShowWindow = 0
        kwargs = dict(creationflags=subprocess.CREATE_NEW_CONSOLE, startupinfo=info)
        argv = [sys.executable, "-I", str(HARNESS / "launch.py")] + argv
    elif not WINDOWS:
        kwargs = dict(start_new_session=True)
    process = subprocess.Popen(argv, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **kwargs)
    _STARTED.append(process)
    try:
        deadline = time.monotonic() + START_TIMEOUT
        while time.monotonic() < deadline:
            text = Path(log_path).read_text(encoding="utf-8", errors="replace")
            match = ADDRESS.search(text)
            if match:
                return Server(process, int(match.group(1)), log)
            if process.poll() is not None:
                raise RuntimeError(f"server exited before listening: {text.strip()[-400:]}")
            time.sleep(0.1)
        raise RuntimeError(f"server did not print its address within {START_TIMEOUT}s")
    except BaseException:
        kill_tree(process)
        _forget(process)
        log.close()
        raise


def stop(server):
    """Ask the server to end, then kill whatever is left. Always call this in a finally."""
    p = server.process
    if p.poll() is None and not WINDOWS:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            pass
    kill_tree(p)
    _forget(p)
    server.log.close()
