# ADR-0007: memory-palace v2 adds scopes, a generated key file and a session-start hook

- **Status:** Proposed (accepted when the pull request that delivers memory-palace v2 merges)
- **Date:** 2026-11-20
- **Deciders:** repo owner, on issues #355 to #359; details by the grill phase of the lifecycle run that builds v2 (autonomous; no human question raised)
- **Amends:** [ADR-0005](0005-memory-palace-data-and-config-location.md)

## Context

[ADR-0005](0005-memory-palace-data-and-config-location.md) placed one palace at a folder the
user picks, and one machine record beside it in the user's configuration folder. The owner then
decided five changes for v2: three scopes (#355), reads that still answer when the palace and
its remote have diverged (#356), an opt-in Claude Code hook (#357), no SQLite backend (#358),
and a setup that proposes one configuration, with a key file it may create (#359).

Four of these put files in places ADR-0005 did not foresee: more than one palace per machine, a
palace that is meant to be lost, a secret that setup writes, and an entry in a settings file
that belongs to Claude Code and that the user also edits.

## Terms

- **Scope:** how far a palace reaches. One of `global`, `project`, `session`.
- **Global palace:** the one palace every project on this machine reads. It is the machine
  record's `default`, as in v1.
- **Project palace:** the palace of one project. The **project root** is the main checkout of
  the git repository that holds the current folder, so every worktree of a repository shares
  one project palace, except a linked worktree of a submodule, which gets its own. Outside a
  git repository it is the current folder.
- **Session:** one Claude Code session, named by the session id that Claude Code puts in the
  environment of the commands it runs (`CLAUDE_CODE_SESSION_ID`). It is not a login. The id
  survives compaction; `/clear` starts a new one.
- **Session palace:** the palace of one session.
- **Machine key file:** the one key file that setup creates for this machine and reuses for
  every palace set up with the default protection.
- **Reminder hook:** the one Claude Code hook the skill installs on request. It prints a
  reminder; it never saves.

## Decision

1. **Where each palace lives.** The global and project palaces live where the user confirms at
   setup. The proposed folders are `$XDG_DATA_HOME/memory-palace/global` and
   `$XDG_DATA_HOME/memory-palace/projects/<name>-<hash>` (`~/.local/share/...` when the
   variable is unset or empty). They are never under `~/.agent-state/`. The global palace has
   its own folder, not the root, because a palace with a remote holds a git repository and
   another palace must not sit inside it.
2. **The machine record** keeps its v1 keys and gains `projects`, a map from a project root to
   its palace folder. v2 adds keys and never renames or removes one.
3. **A session palace lives under the runtime folder**, at
   `$XDG_RUNTIME_DIR/memory-palace/sessions/<session id>`, or under the system's temporary
   folder in a folder named for the user when the variable is unset. It needs no setup and no
   entry in the machine record: the first save to the session scope creates it. It is
   unprotected and has no remote. Nothing in the skill deletes it; the operating system does,
   at logout or when it clears temporary files. On systems other than Windows the skill refuses
   a session folder that is not a real folder owned by the user and closed to everyone else.
4. **The machine key file** lives beside the machine record, at
   `$XDG_CONFIG_HOME/memory-palace/key` (or `~/.config/memory-palace/key`), mode 600. Setup
   creates it only when it is absent, complete or not at all, and never overwrites, prints or
   moves it. It is never synced and never committed: setup refuses to create it inside a git
   repository that does not ignore it. Each palace keeps its own salt, so one key file serves
   every palace on the machine. A palace made on another machine is joined with a copy of that
   machine's key file at a path the user names; the skill never replaces one key file with
   another.
5. **The reminder hook** is one `SessionStart` handler in the user's Claude Code settings file
   (`settings.json` in `$CLAUDE_CONFIG_DIR`, or in `~/.claude/` when that variable is unset).
   It runs `node` with the skill's script and the word `remind` as arguments, with no shell.
   The skill adds, repairs and removes only that handler, through the settings file's real
   path, and keeps the file's other content and its mode. The hook reads the machine record
   and each palace's settings, never a key, a memory or the network.
6. **No SQLite.** ADR-0005's sentence about SQLite's journal no longer applies. A palace whose
   settings name the SQLite backend is refused with the steps to move it, and is left
   unchanged.

ADR-0005 otherwise stands: the machine record is still the only place that holds the remote
URL, the passphrase source and the record that a palace is protected.

## Alternatives considered

- **Session palaces in the user's data folder.** Rejected: nothing would remove them, so
  memories the user marked as passing would stay on disk in clear for good. A session palace
  that is lost early, at a restart before the session is resumed, is the smaller harm.
- **A `session` entry in the machine record, written by setup.** Rejected: it turned "this
  session" into a machine-wide switch and added a setup path, a record key and a status state
  for a palace that is only ever written on request.
- **A hook on every prompt (`UserPromptSubmit`).** Rejected: it adds the reminder to the
  context at every prompt and starts a process each time, and a broken hook would show an
  error at every prompt. `SessionStart` fires once at the start, and again after a resume, a
  `/clear` and each compaction, so the reminder is always in the context for the cost of one.
- **A `Stop` hook that blocks once per turn to ask for a save.** Rejected: it adds a model
  round to every turn, and the end of a turn is not the end of a task.
- **A shell command line for the hook.** Rejected: the script path would need quoting that is
  right in every shell. The handler's `args` list has no shell to quote for.
- **A key file per palace.** Rejected: the user would have several files to back up, and a
  second machine several to copy. The salt in each palace already keeps the derived keys apart.
- **A command that exports a SQLite palace.** Rejected: it needs `node:sqlite`, the dependency
  the removal exists to drop. The v1 scripts stay in the repository's history and can read it.

## Consequences

- No hook can decide what is worth saving. With the hook installed, a session knows from its
  start that a palace exists, with its kinds and moments; the model still does the saving.
- A session palace is lost at logout, even if the Claude Code session is resumed later, and a
  resume that gets a new session id does not find it. On a system that never clears its
  temporary folder, a session palace stays until the user deletes it.
- Losing the machine key file loses every palace sealed with it. Setup says so, with the
  file's path, each time it uses the file.
- A project is known by its root's path. A project that moves loses the link to its palace,
  not the palace: `join` binds it again.
- A read without a named scope opens every palace that exists here, so it can fetch from two
  remotes.
- Another program that rewrites the Claude Code settings file at the same instant as the
  skill can lose one of the two changes. The skill keeps its window short and does not lock a
  file it does not own.
- `scripts/check-state-paths.sh` needs no change: every path above is written with its `~/` or
  variable prefix.
