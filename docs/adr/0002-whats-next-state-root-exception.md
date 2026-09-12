# ADR-0002: whats-next's state root is machine-wide, not per repository

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

[ADR-0001](0001-agent-state-location.md) sets the default state root for a skill acting on
one repository at a time: `~/.agent-state/<repo-slug>/<skill>/`, where `<repo-slug>` names
the repository the skill is working on (its "managed repo"). That shape assumes a single
managed repo per run.

`whats-next` (the `wip` command) does not fit that assumption. It is a personal,
machine-wide tool: one run reads git state, PRs, and now tickets across every repository the
developer has touched recently, and produces one board that spans all of them. There is no
single repository it is "acting on," so there is no one `<repo-slug>` to root its state
under. Its own build cache, its machine-wide `config.json` (every active source, across every
repository), and its `prefs.json` (manual order) are inherently cross-repository; only the
per-repository *discovery record* the PRD asks for (issue #200, "Repository-to-board
mapping" and user story 7) is naturally scoped to one repository, and that scoping belongs
inside `whats-next`'s own state, not as its root.

The tool already uses `~/.agent-state/whats-next/` today (`scripts/wip.ps1`, `SKILL.md`), with
no repository segment. `scripts/check-state-paths.sh` enforces the literal string
`.agent-state/` appearing in a skill's markdown, not the `<repo-slug>/<skill>/` shape itself —
so today's path already passes the check, and continuing it changes nothing the check
enforces.

## Decision

`whats-next`'s state root stays `~/.agent-state/whats-next/` (or
`$AGENTS_STATE/whats-next/` when that variable is set), with no repository segment. This is a
documented exception to ADR-0001's default, not a violation of it: ADR-0001's directory rule
targets a skill with one managed repo per run, and `whats-next` has none.

Layout under that root:

```
~/.agent-state/whats-next/
├── bin/                     the launcher's cached build (see ADR-0003)
├── config.json              every active source, one file per machine, origin-tagged
├── prefs.json               manual order per group (see ADR-0004)
├── board.json               the most recently printed board (unchanged from today)
└── repos/<repo-slug>/
    └── discovery.json       that repository's discovery record: fingerprints, offered/declined
```

`repos/<repo-slug>/` is data inside `whats-next`'s own state, addressed by the repository the
discovery question was about — never a second state root, never read or written by any other
skill.

## Consequences

- `scripts/check-state-paths.sh` needs no change: its existing regex already accepts this
  shape, and this ADR records why the shape is intentional rather than an oversight the next
  reader has to re-derive.
- Any future skill that is also machine-wide (not scoped to one managed repo) can point to
  this ADR instead of re-litigating the question.
- If `whats-next` is ever split so that one part of it *does* act on a single managed repo
  (unlikely; not planned), that part would move under the ADR-0001 default, and this ADR would
  need a revisit.

## Alternatives considered

- **`~/.agent-state/whats-next/<repo-slug>/...` for everything.** Rejected: it would force the
  machine-wide config and build cache to live under an arbitrary "current" repository, or be
  duplicated per repository, when they are inherently shared.
- **A repo-slug of `_global` or similar under the standard shape.** Rejected: it dresses up
  the exception as conformance instead of naming it, which is exactly the confusion ADR-0001
  itself warns against (a folder-presence convention with no rule to break a tie).
