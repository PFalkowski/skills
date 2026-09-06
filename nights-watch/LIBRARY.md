# The Library & the fire — memory of the Watch

Two layers, deliberately separate: **chronicles** (per-agent, raw, written as the work happens) and **the Library** (shared, curated, updated only at the gathering at the fire after work completes). Rangers write chronicles freely; only the fire writes the Library. This is the loyal-dog idea scoped to the Watch: durable facts survive any single context, and recall stays cheap because rangers read an index, not a corpus.

## Layout

Memory sits in two roots at the **main repo root**, split by whether a human is meant to read it. Both are configurable.

The **Library** is a deliverable: curated facts a later reader consults without knowing a patrol ever ran. It is committed, so it survives clones and travels with the project.

```
.nights-watch/
  library/
    INDEX.md               # one line per entry: - [title](slug.md) — hook
    <slug>.md              # one durable fact per file
```

Everything else records only *that* a run happened, so it lives under the house state root from [agent-state.md](../docs/agent-state.md) and is gitignored wholesale — with one exception, `hunts/`, noted below:

```
.agents/nights-watch/
  journal.md               # patrol logbook (see WATCH.md § The watch journal)
  chronicles/              # per-agent, append-as-you-go, raw — one file per ranger run
    <date>-<ticket-id>.md
  locks/                   # claim advertisements, one directory per ticket
  hunts/                   # the Hunt's state + reports — NOT memory, and NOT here on a public repo
    state.md               # the watermark: what has already been examined
    ledger.md              # fingerprints of reported findings, so the horn never blows twice
    carry.jsonl            # candidates found but not yet refuted — rewritten each hunt, never appended
    .lock/                 # in-flight marker (a directory — mkdir is atomic)
    INDEX.md
    <date>-<n>.md
```

`AGENTS_STATE` moves the second root and leaves the first alone: the Library is not run state and never follows it.

**On a repo that has not migrated yet.** For one release, read the new path first and fall back to the retired one when the new path is absent and the old one exists, noting the fallback in the patrol summary. Always *write* to the new path, so a repo migrates by being run. The retired paths are listed in [agent-state.md](../docs/agent-state.md) § Retired paths, not here, because a skill that names its own retired path fails the state-path check — that is what stops the migration quietly reverting. **Try both spellings of the journal**: the old root's file is `JOURNAL.md` on the repos that have one, and a case-sensitive filesystem will not find it under the lowercase name the layout above uses. **The public-repo root outside the repo moved too**, so a Hunt must apply the same fallback there or it starts with an empty watermark and ledger.

`hunts/` sits in the state root, not in the Library, and the distinction is the one this file is built on. A Library entry is *memory*: written by the fire, read as a hint, and — per § Recall — fair game for a ranger who observes it to be wrong. The watermark and the ledger are *law*: there is nothing to fact-check them against, and an agent "correcting" a watermark silently re-scans or skips a delta. So the Hunt's state is machine-written, machine-read, and never curated. What the Hunt *does* contribute to the Library is what the fire is for: which lenses produce noise on this repo, and what each one costs (`calibration`). See [HUNT.md](HUNT.md).

One consequence worth stating here: on a **public** repo, `hunts/` **is not in the repo at all** — the state root moves to `~/.agents/nights-watch/<repo-slug>/` (or wherever `state=` names). The ledger records the file and severity of live unfixed flaws, and committing that publishes exactly what the Hunt's disclosure rule withheld. The in-tree default is gitignored, and on a public repo that is not enough: an ignored file still sits in the tree, one `git add -f` from publication. Moving the root out of the repo is the only version of "not published" that doesn't rely on anyone remembering. Being ignored rather than committed also makes the state per-clone, which costs the incrementality and dedup the ledger exists for — a real price, paid on every repo, and [HUNT.md](HUNT.md) § Where the state root is has the full trade.

The Library stays committed on every repo: a curated convention is not a vulnerability. Chronicles do not — they are raw run notes, ignored in place like the rest of the state root.

## Chronicles — each agent dumps as it goes

Every ranger (and the watcher itself) gets a chronicle path in its brief — an **absolute path outside its worktree**, so notes survive even when the worktree is discarded or the agent dies mid-ticket. Append immediately when something is learned, not at the end — a chronicle's value is highest exactly when the run crashes:

```md
## <what happened> (ticket <id>)
<observation: the convention discovered, the trap hit, the command that finally worked,
 the assumption that proved false — and the evidence>
```

Raw is fine. Redundant is fine. Wrong-once is fine. Chronicles are field notes, not doctrine — nobody reads them except the fire.

## Library entries — one durable fact per file

Same shape as loyal-dog / auto-memory, so any agent can read and write them:

```md
---
name: <short-kebab-slug>
description: <one line — used to decide relevance from INDEX.md alone>
type: convention | gotcha | calibration | decision | tooling
---

<the fact, with its proof or source. Link related entries with [[slug]].>
```

- `convention` — house rules of the repo the Watch works (test layout, naming, CI quirks)
- `gotcha` — a trap that cost tokens once and must not cost them twice
- `calibration` — per-tier token actuals, reserve corrections, rubric misses
- `decision` — a settled choice and its why (so no ranger relitigates it)
- `tooling` — commands/flags that work here (auth incantations, build shortcuts)

## The gathering at the fire — retrospective (mandatory, closes every patrol)

After **Report** and before **Return to the wall**, the watcher convenes the fire — reading every chronicle from the patrol plus the workflow results, and speaking for the rangers who can't:

1. **Share the thoughts.** Walk each chronicle: what surprised, what blocked, what worked. Cross-reference — two rangers hitting the same trap independently is a strong signal it belongs in the Library.
2. **Curate into the Library.** Durable + general → write or update an entry (dedupe against existing ones — update, don't duplicate; an entry falsified by tonight's evidence gets corrected or deleted, per Oath rule 1). One-off noise → dies with the chronicle. Update `INDEX.md` for every change by **reading it first and merging the change in** — a blind `Write` of the whole file discards every line added since whatever stale copy the fire is holding, including entries from a concurrent patrol's fire. If the current content of `INDEX.md` can't be established (the read fails, the ref looks stale, the file looks unexpectedly empty), **refuse to touch it** and flag the conflict in the journal instead of guessing at what belongs there.
3. **Recalibrate.** Fold token actuals into the reserve numbers and tier-rubric notes (`calibration` entries) — this is where WATCH.md's token economics get their data.
4. **Question the Watch itself.** A lesson about the *process* (triage keeps missing X, the ranger prompt lacks Y) doesn't belong in the Library — flag it for the user / `evolve-skill`, since the skill is the canonical place for process fixes.
5. **Burn the old wood.** Mark processed chronicles consolidated (move under `chronicles/consolidated/` or delete, per user preference). The fire ends with a one-line summary in the journal: entries added/updated/removed, calibration deltas.

## Recall — how agents use the Library

- **The watcher** reads `INDEX.md` at the start of every patrol; `calibration` entries feed wave planning. That patrol-start read is validated the same way `args.tickets` is (WATCH.md § Dispatch): a brief whose `libraryIndex` is missing or the literal string `undefined` fails loudly instead of running blind.
- **Rangers** get told in their brief to read `INDEX.md` first and open **only the entries relevant to their ticket** (that's what the one-line descriptions are for) — the Library keeps contexts lean, it must never become the thing that bloats them. A ranger that finds the index missing, unreadable, or unresolved says so in its result — it never treats that as "no entries" and proceeds silently.
- Library entries are memory, not law: they reflect what was true when written. An entry that contradicts what a ranger observes right now is fact-check bait (Oath rule 1) — verify, then fix the entry at the next fire.
- **Fetch before you read a remote ref — never in the same command as the read, and never before the fetch has completed.** Checking whether the Library (or any entry in it) exists by reading a ref such as `origin/main:.nights-watch/library/INDEX.md` returns whatever was fetched last, which is pre-fetch state if the fetch and the read are combined into one invocation or the fetch was skipped. An empty or missing result from a ref you haven't just watched a fetch bring current proves nothing — it is the "the Library is absent" failure this rule exists to close (Oath rule 1's absence-of-evidence caveat, [SKILL.md](SKILL.md)).
