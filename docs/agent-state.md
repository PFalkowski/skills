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
conforming**, and `scripts/check-state-paths.sh` fails the build on one.

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
`.out-of-scope/`, the nights-watch Library (`.nights-watch/library/`),
`docs/recurring-backlog.md` (the recurring schedule a human reads to see what
is due), `prompts/backlog.md` (`prompt-backlog`'s human-authored queue), and
`nightshift`'s `backlog.md` (its human-authored input). No deliverable ever
lives under `.agents/`.

The judgement is not always obvious, and two cases are worth recording
because they went the other way. `sdlc-old-fashioned`'s `sdlc-backlog.md`
reads like a deliverable and is not: the skill's own text calls it live run
scaffolding that the tracker and the PR supersede, and it used to need an
explicit "delete it in the publishing commit" rule precisely because it sat
in a tracked path. Under the ignored root that rule is unnecessary and has
been removed. The nights-watch Hunt's watermark and ledger are the mirror
case: nobody ever reads them, so they are state, but deleting them does lose
something no commit records — a week of re-auditing and a re-report of every
open finding. They still live under `.agents/`, and the fix for durability is
the override rule above, not committing run state (`nights-watch/HUNT.md`
§ Where the state root is).

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

## Retired paths

Every skill that used to keep state somewhere else has moved. The old paths
are listed here, in one place, rather than repeated inside each skill: a
skill directory that names its own retired path fails
`scripts/check-state-paths.sh`, which is what stops a migration from quietly
reverting. A skill that needs to describe its fallback points here instead.

| Retired path | Now | Owner |
|---|---|---|
| `.nights-watch/JOURNAL.md` (also `journal.md`) | `.agents/nights-watch/journal.md` | `nights-watch` |
| `.nights-watch/chronicles/` | `.agents/nights-watch/chronicles/` | `nights-watch` |
| `.nights-watch/locks/` | `.agents/nights-watch/locks/` | `nights-watch` |
| `.nights-watch/hunts/` | `.agents/nights-watch/hunts/` | `nights-watch` |
| `.housekeeping/chronicles/` | `.agents/housekeeping/chronicles/` | `housekeeping` |
| `.recurring-improvement/recurring-backlog.md` | `docs/recurring-backlog.md` | `recurring-improvement` |
| `.agents/recurring-backlog.md` (bare, non-conforming) | `docs/recurring-backlog.md`, or `.agents/recurring-improvement/backlog.md` where the repo keeps agent artifacts out of `docs/` | `recurring-improvement` |
| `docs/sdlc/runs/` | `.agents/sdlc-old-fashioned/runs/` | `sdlc-old-fashioned` |
| `prompts/sdlc-backlog.md` | `.agents/sdlc-old-fashioned/backlog.md` | `sdlc-old-fashioned` |
| `prompts/sdlc-backlog.md` (workflow default) | `.agents/sdlc-workhorse/backlog.md` | `sdlc-workhorse` |
| `.sdlc/chronicles/` | `.agents/sdlc-workhorse/chronicles/` | `sdlc-workhorse` |

The last two are defaults in `.claude/workflows/`, not prose. The check
scans markdown only, so a path that lives in code is not protected by it —
when a workflow's default moves, the value in the script and the example in
its own header comment both have to move with it.

`.nights-watch/library/` is **not** in this table. It is a deliverable, it
stays tracked where it is, and only the run state that used to sit beside it
moved. That is the split PR #145 (`af423a1`) introduced, kept intact.

**A migrated skill must keep reading its old path for at least one release**
before the old path is removed, so a repo mid-upgrade doesn't silently lose
its state. Read the new path first; fall back to the retired one only when
the new path is absent and the old one exists; always write to the new path,
so a repo migrates by being run, and say in the run's report when the
fallback fired. The retired `.nights-watch/` lines stay in this repo's
`.gitignore` for the same window, so a clone written by the previous version
keeps its logs out of the diff.

## Enforcement

[`scripts/check-state-paths.sh`](../scripts/check-state-paths.sh), wired
into CI and covered by [`scripts/check-state-paths.test.sh`](../scripts/check-state-paths.test.sh),
enforces four things and **fails the build** on any match. A check that
cannot fail is not enforcement: `scripts/check-descriptions.sh`'s 320–1024
character warn band currently carries thirteen unresolved warnings with no
build consequence, which is the standing evidence for choosing a failing
check here.

1. It scans every `*.md` file inside each skill directory (not only
   `SKILL.md` — a skill's own layout prose regularly lives in a sibling
   file instead) for a dot-prefixed directory that is neither `.agents/`
   nor a listed deliverable.
2. It scans the same files for a bare file directly under `.agents/` with
   no `<slug>/` segment — the violation named in "The directory rule"
   above. There is no exemption to this one.
3. It scans the same files for any path in the Retired paths table, and
   names where that state went instead. This is what makes the migration
   stick: the generic scan in (1) cannot see these, because a non-dot path
   like `docs/sdlc/runs/` does not match its dot-directory pattern, and
   `.nights-watch/` is exempt as a whole so its tracked `library/` can
   stay — which would otherwise let the retired run-log subpaths beside it
   return unnoticed.
4. It checks the repo's own `.gitignore` for the wholesale `.agents/` line
   the gitignore rule above claims exists, so that claim can't go stale
   again without failing CI.

The only exemptions are the two deliverable roots that are dot-directories,
`.out-of-scope/` and `.nights-watch/`, and they are permanent rather than
migration TODOs: both are named in "Logs vs. deliverables" above as things
that never move. The other named deliverables need no entry, because the
script's dot-directory pattern never matched them in the first place.
