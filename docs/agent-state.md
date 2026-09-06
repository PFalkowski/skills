# Agent state: where skills write logs and operational state

This convention answers one question: when a skill runs and needs somewhere
to write a run log, a journal, a lock, a watermark, or any other record of
*that it ran* — where does that go? It applies to the repository a skill is
acting on (its "managed repo"), which for the skills in this repository is
usually this repository itself.

Enforced by [`scripts/check-state-paths.sh`](../scripts/check-state-paths.sh),
wired into CI (`.github/workflows/checks.yml`).

## The directory rule

A skill's operational state lives at:

```
.agents/<slug>/...
```

`<slug>` is exactly the skill's directory name at this repo's root — the
`<slug>` in `<slug>/SKILL.md`. Sub-paths beneath it are free: a skill can
lay out `.agents/<slug>/journal.md`, `.agents/<slug>/chronicles/`,
`.agents/<slug>/locks/`, whatever its own state shape needs.

A bare file directly under `.agents/` (no skill segment) is **not
conforming**. `recurring-improvement/SKILL.md` currently documents
`.agents/recurring-backlog.md` as one of its candidate roots — that is a
named migration item this convention flags, not a pattern to copy. It should
become `.agents/recurring-improvement/backlog.md` when that skill migrates
(see Migration, below).

## The override rule

Precedence, checked in this order:

1. **A skill-specific variable, if the skill defines one** — e.g.
   `MANAGER_STATE` for the `manager` skill (see `manager/DECIDING.md`).
2. **`AGENTS_STATE`** — a repo-wide override for any skill that doesn't
   define its own variable.
3. **The default, `.agents/`.**

`AGENTS_STATE` holds an **absolute path** and **replaces only the `.agents/`
segment** — the `<slug>/` segment is still appended. `AGENTS_STATE=/var/x`
puts the manager's journal at `/var/x/manager/journal.md`, not at
`/var/x/journal.md`. `AGENTS_STATE` never names a skill directory outright.

## Logs vs. deliverables

The test is decidable, not a list: **a file belongs under `.agents/` if and
only if deleting it loses nothing that a commit, a PR, or the tracker
already records.** If a human is expected to read it later without knowing
a run happened, it is a deliverable, and it keeps its existing human-facing
home — it does not move to `.agents/`.

Named deliverables that do **not** move: `LESSONS-LEARNED.md`, `docs/adr/`,
`.out-of-scope/`, and the nights-watch Library (`.nights-watch/library/`).
No deliverable ever lives under `.agents/`.

## The gitignore rule

`.agents/` is ignored wholesale, with a single line in the managed repo's
`.gitignore`:

```
.agents/
```

There is no per-file opt-in re-inclusion for a path nested inside it. Git
does not descend into an excluded directory, so a `!` negation for a path
under `.agents/` has no effect on its own (`git check-ignore -v` will show
the un-negated parent line as the reason). Making one path trackable again
needs a stepwise ladder — two `.gitignore` lines per directory level,
repeated per skill — which is not a convention worth carrying. The
logs-vs-deliverables rule above is what makes the wholesale ignore safe:
nothing under `.agents/` ever needs to be committed in the first place,
because anything that does is a deliverable and lives elsewhere.

## Gitignore is not the answer for sensitive state on a public repo

The wholesale ignore above is about noise, not secrecy, and it must not be
read as the mechanism for state that is sensitive to publish. `nights-watch`
already argues this directly (`nights-watch/HUNT.md` § Where the state root
is; `nights-watch/LIBRARY.md`): an ignored file still lives in the tree, one
`git add -f` or a tooling change away from being published, and it is
per-clone, so it loses whatever incrementality the state existed for. For
state that must not be published — not merely state nobody needs to read —
the fix is the override in the previous section: point `AGENTS_STATE` (or a
skill-specific variable) at a path outside the repo entirely. Both
mechanisms coexist: `.agents/` gitignored in-tree is the default for
ordinary run noise; a root moved outside the repo is what a public,
sensitive case uses instead.

## `.nights-watch/` is out of scope here

PR #145 (merged, `af423a1`) already tracks `.nights-watch/library/` and
ignores `.nights-watch/JOURNAL.md`, `.nights-watch/chronicles/`,
`.nights-watch/locks/`, and `.nights-watch/hunts/`. This document does not
change any of those four `.gitignore` lines, for three reasons:

1. Migrating existing skills to this convention is explicitly out of scope
   for the issue that introduced it (#119) — this document establishes the
   convention, it does not enact it everywhere.
2. #145's layout is already main: a tracked Library split from ignored run
   logs. That split is exactly what this convention endorses, not a
   contradiction of it.
3. Moving `.nights-watch/` under `.agents/nights-watch/` is real migration
   work (paths written in prose across several files, a live case mismatch
   between `journal.md` and `JOURNAL.md`, and a fallback period) that
   deserves its own PR, not a rider on the convention doc.

The migration itself is filed as a follow-up issue. **A migrated skill must
keep reading its old path for at least one release** before the old path is
removed, so a repo mid-upgrade doesn't silently lose its state.

## Enforcement

[`scripts/check-state-paths.sh`](../scripts/check-state-paths.sh), wired
into CI and covered by [`scripts/check-state-paths.test.sh`](../scripts/check-state-paths.test.sh),
enforces three things and **fails the build** on any match. A check that
cannot fail is not enforcement: `scripts/check-descriptions.sh`'s 320–1024
character warn band currently carries thirteen unresolved warnings with no
build consequence, which is the standing evidence for choosing a failing
check here.

1. It scans every `*.md` file inside each skill directory (not only
   `SKILL.md` — a skill's own layout prose regularly lives in a sibling
   file instead) for a dot-prefixed directory that is neither `.agents/`
   nor on its grandfather allowlist.
2. It scans the same files for a bare file directly under `.agents/` with
   no `<slug>/` segment — the violation named in "The directory rule"
   above — on its own grandfather allowlist (currently just
   `recurring-improvement`'s `.agents/recurring-backlog.md`, the named
   migration item).
3. It checks the repo's own `.gitignore` for the wholesale `.agents/` line
   the gitignore rule above claims exists, so that claim can't go stale
   again without failing CI.

The allowlist is a named, commented set of migration TODOs — `.nights-watch/`,
`.housekeeping/`, `.recurring-improvement/`, `.out-of-scope/`, and (recorded
for the same inventory, though not matched by the script's dot-directory
pattern) `docs/sdlc/runs/`, `prompts/`, `backlog.md`, `LESSONS-LEARNED.md`,
`docs/recurring-backlog.md` — each to be deleted from the script as its
skill migrates, not a permanent exemption.
