# The Library & the fire — memory of the Watch

Two layers, deliberately separate: **chronicles** (per-agent, raw, written as the work happens) and **the Library** (shared, curated, updated only at the gathering at the fire after work completes). Rangers write chronicles freely; only the fire writes the Library. This is the loyal-dog idea scoped to the Watch: durable facts survive any single context, and recall stays cheap because rangers read an index, not a corpus.

## Layout

All memory lives under `.nights-watch/` at the **main repo root** (configurable; committed to the repo so it survives clones and travels with the project — with one exception, `hunts/`, noted below):

```
.nights-watch/
  journal.md               # patrol logbook (see WATCH.md § The watch journal)
  chronicles/              # per-agent, append-as-you-go, raw — one file per ranger run
    <date>-<ticket-id>.md
  hunts/                   # the Hunt's state + reports — NOT memory, and NOT here on a public repo
    state.md               # the watermark: what has already been examined
    ledger.md              # fingerprints of reported findings, so the horn never blows twice
    carry.jsonl            # candidates found but not yet refuted — rewritten each hunt, never appended
    .lock/                 # in-flight marker (a directory — mkdir is atomic)
    INDEX.md
    <date>-<n>.md
  library/
    INDEX.md               # one line per entry: - [title](slug.md) — hook
    <slug>.md              # one durable fact per file
```

`hunts/` sits beside the Library, not inside it, and the distinction is the one this file is built on. A Library entry is *memory*: written by the fire, read as a hint, and — per § Recall — fair game for a ranger who observes it to be wrong. The watermark and the ledger are *law*: there is nothing to fact-check them against, and an agent "correcting" a watermark silently re-scans or skips a delta. So the Hunt's state is machine-written, machine-read, and never curated. What the Hunt *does* contribute to the Library is what the fire is for: which lenses produce noise on this repo, and what each one costs (`calibration`). See [HUNT.md](HUNT.md).

One consequence worth stating here, because it is the single exception to this file's opening line: on a **public** repo, `hunts/` **is not in the repo at all** — the state root moves to `~/.nights-watch/<repo-slug>/` (or wherever `state=` names). The ledger records the file and severity of live unfixed flaws, and committing that publishes exactly what the Hunt's disclosure rule withheld. Gitignoring it in place is the obvious move and the wrong one — an ignored file still sits in the tree, one `git add -f` from publication, and an ignored file is per-clone, which silently costs the incrementality and dedup the ledger exists for. [HUNT.md](HUNT.md) § Where the state root is has the full trade.

Chronicles and the Library stay committed on every repo: a curated convention is not a vulnerability.

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
2. **Curate into the Library.** Durable + general → write or update an entry (dedupe against existing ones — update, don't duplicate; an entry falsified by tonight's evidence gets corrected or deleted, per Oath rule 1). One-off noise → dies with the chronicle. Update `INDEX.md` for every change.
3. **Recalibrate.** Fold token actuals into the reserve numbers and tier-rubric notes (`calibration` entries) — this is where WATCH.md's token economics get their data.
4. **Question the Watch itself.** A lesson about the *process* (triage keeps missing X, the ranger prompt lacks Y) doesn't belong in the Library — flag it for the user / `evolve-skill`, since the skill is the canonical place for process fixes.
5. **Burn the old wood.** Mark processed chronicles consolidated (move under `chronicles/consolidated/` or delete, per user preference). The fire ends with a one-line summary in the journal: entries added/updated/removed, calibration deltas.

## Recall — how agents use the Library

- **The watcher** reads `INDEX.md` at the start of every patrol; `calibration` entries feed wave planning.
- **Rangers** get told in their brief to read `INDEX.md` first and open **only the entries relevant to their ticket** (that's what the one-line descriptions are for) — the Library keeps contexts lean, it must never become the thing that bloats them.
- Library entries are memory, not law: they reflect what was true when written. An entry that contradicts what a ranger observes right now is fact-check bait (Oath rule 1) — verify, then fix the entry at the next fire.
