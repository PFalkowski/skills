"""Git helpers and the benchmark pins."""
import io
import subprocess
import tarfile
from pathlib import Path

PREFIX = "benchmark/issue-25-v1"
PINS = {
    "start": {"tag": f"{PREFIX}/start", "commit": "67821d4"},
    "anchor-x": {"tag": f"{PREFIX}/anchor-x", "commit": "33780fa"},
    "anchor-y": {"tag": f"{PREFIX}/anchor-y", "commit": "d1e66ca"},
    "fixtures": {"tag": f"{PREFIX}/fixtures", "commit": None},
}


class GitError(Exception):
    pass


def git(repo, *args, check=True, binary=False):
    p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if check and p.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {p.stderr.decode('utf-8', 'replace').strip()}")
    return p.stdout if binary else p.stdout.decode("utf-8", "replace").strip()


def resolve(repo, pins=PINS):
    """Resolve every pinned tag to a full commit id, refusing a tag that moved."""
    out = {}
    for name, pin in pins.items():
        sha = git(repo, "rev-parse", "--verify", "--quiet", f"refs/tags/{pin['tag']}^{{commit}}", check=False)
        if not sha:
            raise GitError(f"tag {pin['tag']} is missing in {repo}")
        expected = pin["commit"]
        if expected and not sha.startswith(expected):
            raise GitError(f"tag {pin['tag']} points at {sha[:7]}, expected {expected}")
        out[name] = sha
    return out


def archive(repo, ref, dest):
    """Extract the tree of `ref` into `dest` without touching any ref or the working tree."""
    data = git(repo, "archive", "--format=tar", ref, binary=True)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        for member in tf.getmembers():
            target = (dest / member.name).resolve()
            if dest.resolve() not in target.parents and target != dest.resolve():
                raise GitError(f"archive member escapes the destination: {member.name}")
        try:
            tf.extractall(dest, filter="data")
        except TypeError:
            tf.extractall(dest)
    return dest
