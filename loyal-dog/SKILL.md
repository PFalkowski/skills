---
name: loyal-dog
description: 'Persistent cross-session, cross-project memory that follows the user everywhere — a loyal dog that writes durable facts down and fetches the relevant ones back, with sub-linear (indexed, O(log N)/O(1)-locate) lookup as memories grow, on any OS with no database or server. CAPTURE when the user states something durable and cross-cutting that should outlive this session or repo: "remember this", "don''t forget", "note this for next time", "I always/prefer…", "from now on…", or a correction of a standing assumption/decision worth surviving /clear or a new project. RECALL when the user asks "what do you know about X", "what did I tell you about Y", "have we hit this before", "what''s my preference for Z", "loyal-dog, what do you remember", or at session start / when entering a new project to surface facts scoped to the current project and topic before acting. Memories live in ~/.loyal-dog OUTSIDE any repo, so a fact learned in one project is recalled in another. Triggers: /loyal-dog. NOT for project-local conventions (use CLAUDE.md / project memory) or one-off task carry-overs (use handoff / prompt-backlog).'
---

# loyal-dog

A dog that follows the **owner**, not the yard. It lives outside any single repo — under
`~/.loyal-dog/` — so what it learns in one project it can fetch in another, and it survives
`/clear`, new terminals, and new machines (the directory is a plain folder; sync it with git or
Dropbox if you want it to follow you across computers).

Two moves, one loop: **capture** a durable fact, **recall** the relevant ones later. Memory
*files* are the source of truth; the index is a rebuildable cache. The engine is one
zero-dependency stdlib Python script (`scripts/loyal_dog.py`) — no database, no server, works
identically on Windows/macOS/Linux.

## Scope — what belongs here vs elsewhere

loyal-dog holds facts that must be found again **from a different project or a future session**:
cross-project preferences, standing decisions, "we tried X and it failed because Y", environment
and machine quirks. It is deliberately **not**:

- **Project-local conventions** → those go in that repo's `CLAUDE.md` / project memory.
- **One-off carry-over to the next session** → that's `handoff`.
- **Deferred work / a task queue** → that's `prompt-backlog`.

If a fact is only useful inside one repo, don't put it here.

## When to capture

Whenever the user states something durable and cross-cutting: an explicit "remember this / don't
forget / note for next time", a stated preference ("I always…", "never do X again"), a decision or
gotcha worth persisting, or a correction of a standing assumption. Capture is cheap and
silent-by-default — never interrupt the flow with a question; record it and echo one line.

Do **not** capture ephemeral chatter, secrets/API keys/tokens, or anything the current repo
already records.

## When to recall

- Explicit: "what do you know about X", "have we solved this before", "what's my preference for Z".
- Proactive: at task start or when entering a new project, derive 2–5 query terms from the task +
  project and run one recall. If there are hits, surface the top few in one line before acting.
  Do this once at a boundary — not on every turn (that defeats progressive disclosure).

## Usage

Run the engine with your platform's Python (3.8+). `LOYAL_DOG_HOME` overrides the store location
(default `~/.loyal-dog`).

```
python scripts/loyal_dog.py remember --body "<the fact>" [--tags a,b] [--project <slug>] [--title "<short>"]
python scripts/loyal_dog.py recall  "<query terms>" [--project <slug>] [--limit 5]
python scripts/loyal_dog.py doctor  [--rebuild]
```

- **`--project`** — a slug (repo name, or `global`). Recall boosts memories matching the current
  project, but still sees `global` facts. Omit for cross-cutting facts.
- **`--tags`** — controlled labels you'll also search by (`preference`, `gotcha`, `windows`, …).
- **`doctor`** sweeps orphaned temp files; **`doctor --rebuild`** reconstructs the whole index
  from the memory files after any suspected corruption.

The `remember` command runs a **closure self-test**: right after writing, it recalls the new
memory by one of its own terms and prints `kept` only if the index actually surfaces it —
otherwise it warns you to run `doctor --rebuild`. What is written is verified findable.

## How retrieval stays sub-linear (and where it doesn't)

The mechanism, and an honest accounting of the Big-O, lives in
[`references/format.md`](references/format.md). The short version:

- **Recall by term/tag/project** — the term is hashed to a fixed-depth directory path
  (`index/terms/<a>/<b>/<term>.jsonl`), so locating its postings file is **O(1)** in the total
  memory count N; reading it is **O(k)** in the number of matches. You never touch the N−k
  non-matching memories. That is why it stays sub-linear as the store grows.
- **remember** — appends one posting line per term (**O(1) each**, append-only), and writes the
  memory file under a **unique ULID name** so concurrent sessions never contend — writes are
  lockless.
- **Full-content / "things *like* X" (semantic) search is O(N)** and no plain-file layout escapes
  that without an embedding engine (out of scope for a zero-dependency, any-arch skill). loyal-dog
  does **not** claim sub-linear semantic search. When you need content search, narrow by
  term/tag/project **first**, then scan only the candidate set.

## Durability

Every memory and index write is atomic (temp file in the same directory → `fsync` →
`os.replace`, atomic on both POSIX and Windows). Postings are append-only, so a crash can only
tear the final line, which readers skip. The memory files are the source of truth; the index is
always rebuildable with `doctor --rebuild`. See `references/format.md` for the Windows-vs-POSIX
path/locking details.

## First run

The store auto-creates on first `remember`. Nothing to install — the script is stdlib-only.
