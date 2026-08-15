# loyal-dog — on-disk format & complexity

Read this when debugging the store, migrating the schema, or reasoning about performance. For
day-to-day use, `SKILL.md` is enough.

## Layout

```
<root>/                              # default ~/.loyal-dog ; override with $LOYAL_DOG_HOME
  MANIFEST.json                      # {schema, count, rebuilt_ts} — advisory, recomputable
  memories/<a>/<b>/<ULID>.md         # one memory per file. SOURCE OF TRUTH.
  index/terms/<a>/<b>/<term>.jsonl   # inverted index: append-only postings per term. CACHE.
  tmp/                               # (transient) same-volume staging for atomic writes
  lock/                              # mkdir-mutex, held only during `doctor --rebuild`
  quarantine/                        # memory files that failed to parse during a rebuild
```

- `<a>/<b>` are the first two byte-pairs of `sha256(key)` — a fixed 2-level, 256-way shard. Memory
  files shard on the ULID; postings files shard on the term string. Fan-out is bounded and
  uniform, so no directory grows unbounded relative to the others.
- **Memory file** = YAML-ish front-matter (`id, ts, project, tags, title, terms`) between `---`
  fences, then the body. Because the front-matter carries every indexed `term`, the entire index
  is derivable from the memory files alone.
- **`id` = ULID**: 48-bit millisecond timestamp + 80 random bits, Crockford base32. Globally
  unique (→ two writers never target the same filename → **lockless writes**) and
  lexicographically time-sortable (→ "most recent" is a tail read, no separate time index needed).

## Complexity — worked, and honest

Let **N** = total memories, **k** = matches for a queried term.

**Recall by term/tag/project — O(1) locate + O(k) read.**
`sha256(term)` gives the postings path by pure string arithmetic — no scan of anything, independent
of N. Descending the fixed two shard levels + opening one file is a constant number of filesystem
operations. Reading the postings file costs O(k), proportional to *answers*, not to the corpus.
**You never touch the N−k non-matching memories** — that is the whole reason it is sub-linear.
Multi-term queries union/intersect postings (bounded by Σkᵢ) then rank; still independent of N.

**remember — O(m) for m terms.**
Postings are **append-only** (`open(..., "a")`), so each of the m term updates is an O(1) append,
not a read-modify-rewrite of a sorted structure. The memory file is written once under a unique
name. No global lock is taken.

**Recency — free.** ULIDs sort by time, so the newest matches are the last lines of a postings
file; "most recent about X" is a tail read of the term's postings.

**What stays linear — stated plainly:**
- **Full-content substring / fuzzy / semantic search is O(N).** Nothing pre-indexes arbitrary
  substrings or meaning; answering "find memories that *mean* the same thing" must open records.
  No plain-file layout fixes this without an embedding + ANN index, which needs an engine and is
  out of scope. **Mitigation, not a complexity claim:** always narrow by the term index first and
  scan only the candidate set, so the linear factor applies to k candidates, not N.
- **`doctor --rebuild` is O(N)** — it scans every memory's front-matter. Rare (only after
  corruption) and correctness-restoring, so the cost is acceptable.

**Filesystem honesty.** Per-directory *name* lookup is O(log d) on B-tree-indexed filesystems
(NTFS, ext4 `dir_index`, APFS) and O(d) on legacy ones (FAT/exFAT). The 256-way shard bounds d, so
the per-level term is a small constant or `log(small)` either way — it does not reintroduce an
O(N) factor. Net: **O(1) expected, O(log N) worst-case** for keyed lookup.

## Atomicity & durability

- **Atomic writes**: write to `.tmp.<pid>.<ulid>` in the **same directory** (→ same volume, so the
  rename can't degrade to a copy), `flush` + `os.fsync`, then `os.replace(tmp, final)`. `os.replace`
  is atomic on POSIX (`rename(2)`) and on Windows (`MoveFileEx` with `REPLACE_EXISTING`) — unlike
  `os.rename`, it overwrites atomically on NT. A half-written file only ever exists as a `.tmp.*`
  and is never visible at the final path.
- **Append-only postings**: one complete JSON line per posting, newline-terminated. A crash mid-append
  tears at most the final line; the reader drops a line that fails to parse. Postings are idempotent
  (keyed by `id`), so a replay/rebuild never double-counts.
- **Recovery invariant — memory files are truth, index is cache.** If the index is missing or
  suspect, `doctor --rebuild` reconstructs `index/` from the memory files; a memory that fails to
  parse is moved to `quarantine/`, never deleted. A memory is never orphaned from its retrievability.

## Windows-vs-POSIX specifics

- **Filenames** use only Crockford base32 / lowercased terms → no `: < > | ? * "` (forbidden on
  NTFS), no case-collision surprises (NTFS/APFS are case-insensitive-preserving; ext4 is not — so
  terms are lowercased before hashing so the same term maps to the same file everywhere).
- **Reserved device names** (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`) — a term
  equal to one gets a leading `_` before becoming a filename.
- **Path length**: the 2-level shard + short (26-char) ULID names keep every path well under 260
  chars, so no `\\?\` long-path prefix is needed.
- **Replace under contention**: `os.replace` on Windows can transiently fail if the destination is
  open; the writer retries with a short backoff (3 attempts).
- **Locking**: only `doctor --rebuild` takes a lock, via `os.mkdir(lock/)` — directory creation is
  atomic and fail-if-exists on **every** OS/filesystem, avoiding the `flock`/`LockFileEx`
  portability trap. Reads and normal writes take no lock at all.

## The closure guarantee

Capture and recall call the **same** `normalize_terms()` function, so a term that indexed a memory
is byte-identical to the term a query produces — anything written is findable by construction. The
`remember` command additionally verifies this at runtime: it recalls the just-written memory by one
of its own terms and reports `kept` only if the index surfaces it, otherwise it tells you to
rebuild.
