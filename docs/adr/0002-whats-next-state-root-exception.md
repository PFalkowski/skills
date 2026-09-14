# ADR-0002: whats-next's state root is machine-wide, not per repository

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

[ADR-0001](0001-agent-state-location.md)'s default state root,
`~/.agent-state/<repo-slug>/<skill>/`, assumes one managed repository per run. `whats-next`
(the `wip` command) is a personal, machine-wide tool: one run spans every repository the
developer has touched recently and produces one board across all of them, so there is no
single `<repo-slug>` to root its state under. Only the per-repository *discovery record* the
PRD asks for (issue #200, "Repository-to-board mapping" and user story 7) is naturally scoped
to one repository, and that scoping belongs inside `whats-next`'s own state, not as its root.

The tool already uses `~/.agent-state/whats-next/` today (`scripts/wip.ps1`, `SKILL.md`), with
no repository segment. `scripts/check-state-paths.sh` checks for the literal string
`.agent-state/`, not the `<repo-slug>/<skill>/` shape itself, so this path already passes.

## Decision

`whats-next`'s state root stays `~/.agent-state/whats-next/` (or
`$AGENTS_STATE/whats-next/`), with no repository segment — a documented exception to
ADR-0001, whose directory rule targets a skill with one managed repo per run.

```
~/.agent-state/whats-next/
├── bin/                     launcher's cached build (ADR-0003)
├── config.json              every active source, one file per machine, origin-tagged
├── prefs.json               manual order per group (ADR-0003)
├── board.json               most recently printed board
└── repos/<repo-slug>/
    └── discovery.json       that repository's discovery record
```

`repos/<repo-slug>/` is data inside `whats-next`'s own state, addressed by the repository the
discovery question was about — never a second state root, never read or written by any other
skill.

## Consequences

- `scripts/check-state-paths.sh` needs no change; this ADR records why the shape is
  intentional rather than an oversight the next reader has to re-derive.
- Any future skill that is also machine-wide, not scoped to one managed repo, can cite this
  ADR instead of re-litigating the question.

## Alternatives considered

- **`~/.agent-state/whats-next/<repo-slug>/...` for everything.** Rejected: it would force
  the machine-wide config and build cache to live under an arbitrary "current" repository, or
  be duplicated per repository, when they are inherently shared.
- **A repo-slug of `_global` under the standard shape.** Rejected: it dresses the exception up
  as conformance instead of naming it.
