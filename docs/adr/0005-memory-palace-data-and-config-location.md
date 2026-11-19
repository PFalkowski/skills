# ADR-0005: memory-palace keeps the palace and its machine record outside the agent-state root

- **Status:** Proposed (accepted when the pull request that adds `memory-palace` merges)
- **Date:** 2026-11-18
- **Deciders:** Grill phase of the lifecycle run that adds `memory-palace` (autonomous; no human question raised)

## Context

`memory-palace` stores memories an agent keeps for its user. Each palace is a folder the user
picks. A later session must find the palace without the user naming its folder again, and must
know how to get the passphrase on this machine.

[ADR-0001](0001-agent-state-location.md) sends a skill's operational state to
`~/.agent-state/<repo-slug>/<skill>/`. That root may be deleted at any moment after a merge
(ADR-0001, Decision 1). The test in [docs/agent-state.md](../agent-state.md) ("Logs vs.
deliverables") puts a file there only if deleting it loses nothing. [ADR-0002](0002-whats-next-state-root-exception.md)
lets a machine-wide skill keep its config at `~/.agent-state/<skill>/`.

Two kinds of file fail that test here:

- **The palace.** It is the user's data. Deleting it loses the memories.
- **The machine record.** It names the palace folders on this machine, where the passphrase
  comes from (an environment variable name or a key-file path), whether each palace was set
  up as protected, and the remote URL the skill set for it. Deleting it loses the way back to the
  palace. It also loses the check that stops a palace whose synced settings were changed to
  "unprotected" from being written in clear, and the only source git has for where to fetch from
  and push to.

## Decision

- The palace lives only at the folder the user picks at setup. The skill never puts it under
  `~/.agent-state/`.
- The machine record lives at `$XDG_CONFIG_HOME/memory-palace/config.json`, or at
  `~/.config/memory-palace/config.json` when `XDG_CONFIG_HOME` is unset or empty. It is never
  synced and never committed to a palace's git remote.
- Settings that every copy of a palace shares (format version, backend, protection, key
  derivation parameters and salt, the passphrase check, kinds, moments, the confirmed-private
  remote URL) live inside the palace folder. Settings that differ per machine live in the
  machine record. The remote URL lives only in the machine record. Git is given it on the
  command line for every fetch and push, and the palace's git configuration names no remote,
  so someone who can write the palace folder cannot send a push elsewhere.
- `memory-palace` keeps no operational state of its own. While a command runs, a folder-backend
  palace also holds its lock file, and during a write a pending marker; a SQLite palace holds
  SQLite's journal. These are part of the store's format, like a database journal, not run
  state, and git never tracks them.

## Alternatives considered

- **The machine record under `~/.agent-state/memory-palace/`, citing ADR-0002.** Rejected: that
  root holds a skill's run state. The convention keeps some files there whose loss costs
  something ([docs/agent-state.md](../agent-state.md), and ADR-0002's per-machine `config.json`),
  but losing them costs the skill work, while losing this record cuts the user off from their own
  data. It also carries a security check that must not vanish when someone clears run state.
- **An environment variable only.** Rejected: setup cannot set a variable for later sessions, so
  the user would have to edit a shell profile by hand.
- **One fixed palace folder.** Rejected: the user chooses where the palace lives and how it is
  backed up.

## Consequences

- `scripts/check-state-paths.sh` needs no change. It passes `~/.config/memory-palace/...`. A bare
  dot-folder name in a skill's markdown, such as a palace folder written without its `~/`
  prefix, fails it.
- A machine that loses its record still has the palace. The user names its folder and its remote
  URL once more through `join`, and the skill trusts that palace's settings again. Until then
  an unprotected palace saves locally and does not sync, and a protected palace cannot be opened,
  because the record also held where its passphrase comes from.
