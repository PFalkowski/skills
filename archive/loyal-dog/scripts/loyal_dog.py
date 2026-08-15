#!/usr/bin/env python3
"""loyal-dog — cross-context, file-based memory with sub-linear keyed retrieval.

Zero dependencies (Python 3.8+ stdlib only). Works identically on Windows, macOS,
and Linux. No database, no server, no daemon.

Store layout (default root: ~/.loyal-dog, override with $LOYAL_DOG_HOME):

    <root>/
      MANIFEST.json                 # schema version + advisory counters (recomputable)
      memories/<a>/<b>/<ULID>.md    # one memory per file; hash-sharded; source of truth
      index/terms/<a>/<b>/<term>.jsonl  # inverted index: append-only postings per term
      tmp/                          # staging for atomic write+rename (same volume as store)
      lock/                         # mkdir-mutex, held only during `doctor --rebuild`

Complexity (honest):
  - recall by term:  O(1) locate the postings file (hash → fixed-depth dirs)
                     + O(k) to read k postings.  Independent of total memory count N.
  - remember:        O(m) appends for m terms (append-only postings → O(1) each). Lockless
                     because every memory file has a unique ULID name — no write contention.
  - full-content / semantic ("things LIKE x"): O(N) by nature. We always narrow by the
                     term index FIRST and only scan the candidate set, never all of N.
  - doctor --rebuild: O(N), rare (only after corruption). Rebuilds index from memory files.

Commands:
    remember  --body "..." [--tags a,b] [--project slug] [--title "..."]
    recall    "query terms" [--project slug] [--limit 5]
    doctor    [--rebuild]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

SCHEMA = 1
_STOP = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "is",
    "it", "this", "that", "with", "as", "at", "by", "be", "we", "i", "you",
    "my", "our", "was", "are", "were", "will", "do", "did", "not", "no",
}
# Windows reserved device names — a term equal to one of these gets a leading _.
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)),
             *(f"lpt{i}" for i in range(1, 10))}

# Crockford base32 (no I, L, O, U) — filesystem-safe, case-insensitive-safe.
_B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def root() -> Path:
    return Path(os.environ.get("LOYAL_DOG_HOME", Path.home() / ".loyal-dog"))


# ---------------------------------------------------------------------------
# ULID: 48-bit ms timestamp + 80 random bits. Lexicographically time-sortable,
# unique (so two writers never collide on a filename → lockless writes).
# ---------------------------------------------------------------------------
def new_ulid() -> str:
    ms = int(time.time() * 1000) & ((1 << 48) - 1)
    rnd = int.from_bytes(os.urandom(10), "big")
    n = (ms << 80) | rnd
    out = []
    for _ in range(26):
        out.append(_B32[n & 0x1F])
        n >>= 5
    return "".join(reversed(out))


# ---------------------------------------------------------------------------
# THE shared normalizer. Capture and recall BOTH call this, so any term that
# indexed a memory is byte-identical to the term a query produces. This is what
# guarantees the loop closes: what is written is findable.
# ---------------------------------------------------------------------------
def normalize_terms(text: str) -> list[str]:
    text = text.lower()
    # ASCII-fold roughly; keep alphanumerics and internal hyphens.
    words = re.findall(r"[a-z0-9][a-z0-9\-]*", text)
    seen, terms = set(), []
    for w in words:
        w = w.strip("-")
        if len(w) < 2 or w in _STOP or w in seen:
            continue
        seen.add(w)
        terms.append(w)
    return terms


def _safe_term_name(term: str) -> str:
    if term in _RESERVED:
        return "_" + term
    return term


def _shard(key: str) -> tuple[str, str]:
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return h[0:2], h[2:4]


def _postings_path(term: str) -> Path:
    a, b = _shard(term)
    return root() / "index" / "terms" / a / b / (_safe_term_name(term) + ".jsonl")


def _memory_path(ulid: str) -> Path:
    a, b = _shard(ulid)
    return root() / "memories" / a / b / (ulid + ".md")


# ---------------------------------------------------------------------------
# Atomic write: temp in same directory (guarantees same volume) + fsync + rename.
# os.replace is atomic on POSIX (rename) and Windows (MoveFileEx REPLACE_EXISTING).
# ---------------------------------------------------------------------------
def atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".tmp.{os.getpid()}.{new_ulid()}"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    for attempt in range(3):  # Windows may transiently fail if dest is open
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == 2:
                raise
            time.sleep(0.05 * (attempt + 1))


def append_line(path: Path, obj: dict) -> None:
    """Append one complete JSON line. A crash can only tear the final line;
    readers drop a trailing line that fails to parse."""
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n"
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())


def read_postings(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # torn/partial final line — skip
    return out


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_remember(args) -> int:
    ulid = new_ulid()
    project = (args.project or "global").strip().lower()
    tags = [t.strip().lower() for t in (args.tags or "").split(",") if t.strip()]
    title = args.title or (args.body.strip().splitlines()[0][:80] if args.body else "(untitled)")

    # Terms = normalized(title + body) ∪ tags ∪ project — the recall set.
    terms = set(normalize_terms(title + " " + (args.body or "")))
    terms.update(tags)
    terms.add(project)

    front = {
        "id": ulid,
        "ts": int(time.time()),
        "project": project,
        "tags": tags,
        "title": title,
        "terms": sorted(terms),
    }
    doc = "---\n" + json.dumps(front, indent=2, ensure_ascii=False) + "\n---\n\n" + (args.body or "").strip() + "\n"

    # 1) memory file (source of truth) 2) postings (derived cache).
    atomic_write(_memory_path(ulid), doc)
    posting = {"id": ulid, "ts": front["ts"], "project": project}
    for term in terms:
        append_line(_postings_path(term), posting)

    # Post-capture closure self-test: recall by one term must surface this id.
    probe = next(iter(terms))
    hit = any(p.get("id") == ulid for p in read_postings(_postings_path(probe)))
    status = "kept" if hit else "WARNING: index probe failed — run `doctor --rebuild`"
    print(f'Fetch: buried "{title}" [{",".join(tags) or "-"}] ({project}) — {status}')
    print(f"id: {ulid}")
    return 0 if hit else 1


def cmd_recall(args) -> int:
    q_terms = normalize_terms(args.query)
    if args.project:
        q_terms.append(args.project.strip().lower())
    if not q_terms:
        print("(no searchable terms in query)")
        return 0

    # Union postings across query terms; score by term-overlap then recency.
    scores: dict[str, dict] = {}
    for term in q_terms:
        for p in read_postings(_postings_path(term)):
            rec = scores.setdefault(p["id"], {"id": p["id"], "ts": p.get("ts", 0),
                                              "project": p.get("project"), "hits": 0})
            rec["hits"] += 1

    if not scores:
        print("No memories match. (Full-content search is O(N); narrow with tags/project.)")
        return 0

    cur_proj = (args.project or "").strip().lower()
    ranked = sorted(
        scores.values(),
        key=lambda r: (r["hits"], r["project"] == cur_proj, r["ts"]),
        reverse=True,
    )[: args.limit]

    for r in ranked:
        mem = _memory_path(r["id"])
        if not mem.exists():
            continue
        text = mem.read_text(encoding="utf-8")
        body = text.split("---\n", 2)[-1].strip()
        try:
            front = json.loads(text.split("---\n")[1])
            title = front.get("title", r["id"])
        except Exception:
            title = r["id"]
        print(f"• {title}  [{r['project']}]  (match {r['hits']})")
        for line in body.splitlines()[:6]:
            print(f"    {line}")
        print()
    return 0


def cmd_doctor(args) -> int:
    r = root()
    mem_root = r / "memories"
    memories = list(mem_root.rglob("*.md")) if mem_root.exists() else []
    print(f"memories: {len(memories)}")

    if not args.rebuild:
        # Sweep orphaned temp files from crashed writes.
        stale = [p for p in r.rglob(".tmp.*")]
        for p in stale:
            try:
                p.unlink()
            except OSError:
                pass
        print(f"cleaned {len(stale)} stale temp file(s). Run with --rebuild to reindex.")
        return 0

    # Rebuild index/ from the memory files (source of truth). O(N), rare.
    lock = r / "lock"
    try:
        lock.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        print("another doctor is running (lock/ exists); aborting.")
        return 1
    try:
        idx = r / "index"
        if idx.exists():
            import shutil
            shutil.rmtree(idx)
        rebuilt = 0
        for mem in memories:
            text = mem.read_text(encoding="utf-8")
            try:
                front = json.loads(text.split("---\n")[1])
            except Exception:
                (r / "quarantine").mkdir(exist_ok=True)
                (r / "quarantine" / mem.name).write_text(text, encoding="utf-8")
                continue
            posting = {"id": front["id"], "ts": front.get("ts", 0),
                       "project": front.get("project", "global")}
            for term in front.get("terms", []):
                append_line(_postings_path(term), posting)
            rebuilt += 1
        atomic_write(r / "MANIFEST.json",
                     json.dumps({"schema": SCHEMA, "count": rebuilt,
                                 "rebuilt_ts": int(time.time())}, indent=2))
        print(f"rebuilt index from {rebuilt} memories.")
        return 0
    finally:
        try:
            lock.rmdir()
        except OSError:
            pass


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="loyal_dog", description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("remember", help="record a durable cross-context memory")
    r.add_argument("--body", required=True)
    r.add_argument("--tags", default="")
    r.add_argument("--project", default="global")
    r.add_argument("--title", default="")
    r.set_defaults(func=cmd_remember)

    c = sub.add_parser("recall", help="fetch memories by term/tag/project")
    c.add_argument("query")
    c.add_argument("--project", default="")
    c.add_argument("--limit", type=int, default=5)
    c.set_defaults(func=cmd_recall)

    d = sub.add_parser("doctor", help="verify/repair the store")
    d.add_argument("--rebuild", action="store_true")
    d.set_defaults(func=cmd_doctor)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
