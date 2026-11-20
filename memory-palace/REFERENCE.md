# memory-palace command reference

Read this before `setup`, `join`, `remote` or `hook`, or when you need a limit or a result field that [SKILL.md](SKILL.md) does not show. Every command runs as `node <skill-dir>/scripts/palace.js <command> [--scope global|project|session] [--palace <dir>]`, with its input as one JSON object on standard input through a quoted heredoc.

## Scopes

- `--scope` and `--palace` each pick one palace, and come at most once each. Both together are a usage error (exit 2) except for `setup` and `join`, where `--scope` names the scope to bind and `--palace` the folder.
- The project root is found with one `git rev-parse` call (5-second limit; a call that runs out stops the command). It is the main checkout for a main checkout and for each of its linked worktrees, and a submodule's own checkout inside a submodule. A linked worktree of a submodule gets a palace of its own. Outside a git repository, or without git, it is the current folder, so a command run from a subfolder there does not find the palace of the folder above.
- Without options, `save`, `forget`, `sync`, `check`, `remote` and `unlock` use the global palace and refuse without one. `recall`, `browse` and `list` read the session palace, then the project palace, then the global one; a folder bound to both project and global is read once, as the project palace. A project or global error stops the read; a session error becomes a `warning` and the other scopes answer. `recall` returns the narrowest memory when several scopes hold the place, with `alsoIn` naming the others, such as `["project", "global"]`. `browse` returns every scope's memories, narrowest first; `list` returns the sorted union of names.
- With `--scope` or `--palace`, `recall` and `browse` add `scope` to each memory: the scope bound to that folder, or `null` for a `--palace` folder no scope uses. An error then carries no scope prefix.
- `status` without options returns `{scopes: {global, project, session}, projectRoot}`, plus `proposed` for the global scope when global and project are both `null`; a session palace that cannot be read is `null` there, with a `warning`. With `--scope` it returns that palace's shape, or `{palace: null, proposed}` for a global or project scope not set up, `{palace: null}` for a session that has saved nothing; with `--palace`, that folder's shape. A palace's shape holds `passphrase`: the source this machine recorded for it (`{"file": ...}`, `{"env": ...}` or `null`), never a value.
- A project palace lives in `$XDG_DATA_HOME/memory-palace/projects/<folder name>-<12 hex characters>`, named for the project root. The machine record maps each project root to its palace under `projects`.
- **The session scope** is named by `CLAUDE_CODE_SESSION_ID`, which Claude Code sets in the commands it runs; it must match `^[A-Za-z0-9_-]{1,128}$`. Without a valid id, `--scope session` refuses ("the session scope needs a session id") and a read without options skips the session scope.
- A session palace lives in `$XDG_RUNTIME_DIR/memory-palace/sessions/<session id>`, or `<temporary folder>/memory-palace-<user name>/sessions/<session id>` when `XDG_RUNTIME_DIR` is unset. It lasts while the id stays the same (it changes at `/clear`, and may change on resume) and the folder exists (gone at logout or restart, or when the system cleans its temporary folder).
- It needs no setup: the first `save --scope session` creates it, unprotected, with no remote, the default kinds and moments `["on-request"]`, and writes nothing to the machine record. `setup --scope session` and `join --scope session` are usage errors; `remote --scope session` refuses ("a session palace has no remote"); any other `--scope session` command before the first save refuses ("this session has saved no session memories").
- Outside Windows, the folder `memory-palace` (or `memory-palace-<user name>`), its `sessions` folder and the session's own folder must each be a folder, not a link, owned by the current user, with no access for group or others; the skill creates them mode 700. Otherwise the command refuses, naming the folder ("... is not a private folder of the current user"). A session palace that cannot be read, or a part of it the system's cleaner removed, gives a warning on a read without options; nothing in the skill deletes it, so only the user deleting its folder drops it.
- **A moved project** no longer matches its recorded root, so its scope reads as not set up; its palace is untouched under `projects/`, named for the old folder name. From the new place, run `status --palace <that palace>` for its `passphrase`, then `join --scope project --palace <that palace>` with it.

## Places and limits

- A place is segments joined by `/`: no leading or trailing `/`, no empty segment, no `.` or `..` segment, no control character. At most 256 characters and 16 segments.
- `title` at most 120 characters, `summary` 400, `text` 32,000, `kind` 32. All five `save` fields are required strings.
- `browse` with a place returns that place and everything under it, in place order. `list` returns segment names, not full places.
- `saved` is the time of the save, as an ISO 8601 timestamp.

## setup

`setup [--scope global|project] [--palace <dir>]`, every input field optional:

```sh
node <skill-dir>/scripts/palace.js setup <<'EOF'
{}
EOF
```

- Without `--palace`, the palace goes in the scope's folder, `$XDG_DATA_HOME/memory-palace/global` (or `~/.local/share/memory-palace/global`) for the global scope, and missing parent folders are created, mode 700. A folder given with `--palace` must be absent or empty, and its parent must exist. Every new palace folder is mode 700.
- `passphrase`: left out, the palace is encrypted with this machine's key file, `$XDG_CONFIG_HOME/memory-palace/key` (or `~/.config/memory-palace/key`). Setup creates it when absent: 32 random bytes in base64url, mode 600, complete or not at all, and never inside a git repository that does not ignore it. An existing key file is used as it is and never written. `null` makes an unprotected palace; `{"env": "<variable name>"}` or `{"file": "<key file path>"}` names a source the user set, which must hold a non-empty passphrase. One trailing newline in a key file is ignored.
- `kinds`: a list of strings, default `["decision", "preference", "fact", "lesson"]`. `moments`: a list drawn from `on-request`, `after-decision`, `end-of-task`, default all three.
- `remote`: a git repository URL, or `null` (the default) for none. `"private": true` when the user confirmed the remote is private.
- `backend`: optional; `"folder"` is the only backend. `"sqlite"` is a usage error (exit 2).
- With a remote, this machine records its URL in `$XDG_CONFIG_HOME/memory-palace/config.json` (or `~/.config/memory-palace/config.json`) as the palace's `origin`. Git is given that URL on the command line for every fetch and push; the palace's `.git/config` names no remote.
- Result: `{palace, scope, default}`; `keyFile` and `note` whenever the machine key file was used; `warning` when the push did not happen (an unconfirmed remote, or a push that failed) or a protected palace sits in a git repository that does not ignore it. The new palace is bound to its scope (`global` when `--scope` is left out), replacing any palace that scope had; no other scope changes. The old palace's folder and record entry stay.
- `status` with no palace in the scope returns `proposed`: `{scope, palace, passphrase: {file, create}, remote, kinds, moments}`, the defaults above with absolute paths. `create` is true when the key file does not exist yet.
- A refused setup writes nothing, the key file included. A remote that cannot be reached, or is not empty, refuses the setup.
- An unprotected palace inside a git repository that does not ignore it is refused, unless it is set up with a remote, which gives it a repository of its own: ignore the folder there, choose another folder, or turn on protection.

## join

`join [--scope global|project] [--palace <dir>]` registers a palace on this machine; without `--palace`, the folder is the scope's default folder above. `passphrase` has no default: a palace made on another machine opens only with that machine's key file, which the user copies here to a path of their choice:

```sh
node <skill-dir>/scripts/palace.js join --palace ~/memory-palace <<'EOF'
{"remote": "git@github.com:<owner>/<repo>.git", "passphrase": {"env": "MEMORY_PALACE_PASSPHRASE"}}
EOF
```

- When `<dir>` is absent or empty, `join` clones `remote` into it and removes the `remote` and `branch` sections the clone wrote. When `<dir>` already holds a palace, see the rules below for `remote`.
- `passphrase` has the same shape as in `setup`, and is `null` for an unprotected palace. A protected palace is checked against it. A passphrase given for a palace whose settings say it is not protected is refused, and `join` never clears this machine's record that a palace is protected.
- On a folder that already holds a palace, `join` records its passphrase source again, which is the fix when this machine's record has none.
- A palace folder this machine does not know, with a `.git`: the input must contain `remote`, the palace's URL or `null` for none. Without the key, `join` refuses and writes nothing. With a URL, `join` removes any `remote` and `branch` sections from the folder's `.git/config` (a hand clone has them) and records the URL; it never prints a URL from the folder. With `null`, a configuration that names a remote is refused like any key memory-palace did not write.
- A palace folder this machine does not know, without a `.git`: leave `remote` out or pass `null`. A URL is refused; join without it, then run `remote`.
- A folder this machine knows: `remote` is not needed and is ignored; `join` keeps the recorded URL and changes nothing in the folder.
- Result: `{joined, scope, default}`. With `--scope`, `join` binds that scope to the palace, a known folder included. Without it, a folder this machine did not know becomes the global palace (`scope: "global"`), and a known one changes no binding (`scope: null`).

## remote

Adds a git remote to a folder palace, or moves it to another URL, and pushes:

```sh
node <skill-dir>/scripts/palace.js remote <<'EOF'
{"url": "git@github.com:<owner>/<repo>.git", "private": true}
EOF
```

- Pass `"private": true` only after the visibility check and the user's confirmation in [SKILL.md](SKILL.md). A protected palace pushes without it.
- Result: `{remote, synced}`, and `warning` when the push did not happen. The remote must be empty, or hold this palace's own history.
- `remote` records the URL on this machine and writes nothing to `.git/config`. It refuses a palace whose configuration names a remote, like every other command.
- The URL is at most 2,048 characters with no control characters. A URL with a password, a token, a query, a fragment or a `::` form is refused.
- Commits carry the author `memory-palace` and the current time, whatever the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables say. Git never prompts on the terminal.
- The palace's `.git/config` may hold only the keys that `git init` writes; any other key, `remote.*`, `branch.*` and `include.*` among them, is refused, and so is a `.git/remotes` or `.git/branches` folder that holds files. On systems other than Windows, `.git` and `.git/config` must be owned by the user.

## hook

`hook` takes no option and `{"action": "install"}` or `{"action": "remove"}`, and returns `{"hook": "installed" | "absent", "changed": true | false, "settings": "<settings file>"}`. It works only in Claude Code, and the handler needs a current Claude Code (one that runs a handler's `args`).

- **Setup line 7** reads "off" when `status` without options reports `hook` as `absent`; "on" for `installed` (offer "hook off", which is `remove`); "broken" for `stale`, an own handler that names another `palace.js`, such as after the skill folder moved (offer a repair, which is `install`). Run `hook` only when the user asks. After a change, tell the user that Claude Code picks it up itself, that it takes effect at the next session start or compaction, and that `/hooks` shows it.
- **What it adds:** one group under `hooks.SessionStart`, with no matcher, holding `{"type": "command", "command": "node", "args": ["<palace.js as run>", "remind"], "timeout": 10}`. Its own handlers are those whose `args` are exactly a path ending in `palace.js` and `remind`; nothing else in the file is touched. `install` changes nothing when that one handler is already there, and otherwise replaces every own handler with it. `remove` deletes every own handler, then any group, `SessionStart` list or `hooks` object left empty.
- **What it does:** at every session start, resume, `/clear` and compaction, `remind` prints one line naming the skill, then one line for the global palace and one for this folder's project palace, each only if it has a moment, giving its kinds and moments. A kind outside lowercase letters, digits and `-` (at most 32) is not printed; that line reads "kinds that `status` shows". `remind` reads only the machine record and each `palace.json`, runs one local git call (the project root), and takes no key, no lock and no network. On any error it prints nothing and exits 0. It does not save: the model still loads the skill and saves at the moments.
- **The settings file** is `settings.json` in `$CLAUDE_CONFIG_DIR` when that is set, otherwise in `~/.claude/`. It is written through its real path, so a link stays a link, with its mode kept (600 for a new file). It is rewritten as JSON with two-space indentation: every value and key order is kept, but the file's own formatting is lost, and keys that are whole numbers move to the front of their object. Another program that writes the file at the same instant can lose its change.
- A settings file that is not JSON, or whose `hooks` or `hooks.SessionStart` has another shape, is refused unchanged; `status` then reports `absent`.
- If a session start shows a hook error, run `hook` with `{"action": "remove"}`, or install again to repair a stale path.

## Other result fields

- `save` reports `synced: true` only after a push succeeded; an offline palace, or one with no recorded remote, reports `false`. `status` reports `remote` as the recorded URL, or `null`. `save`, `forget` and `check` add `warning` when the push did not happen. Reads add `warning` when the fetch failed, the remote holds foreign files, or the palace and its remote have both changed since they last matched; the answer then comes from the local copy and nothing is merged. A read that cannot reach the remote still warns about a divergence its last fetch saw.
- `forget` on a palace with a remote adds `note`: git history still holds earlier versions.
- `recall`, `browse` and `list` do not clean up the pages of a write that was killed or is still running; the next `save`, `forget`, `check`, `sync` or `remote` does.
- On SIGINT or SIGTERM while it holds the lock, a command finishes and exits with its own code. A second signal ends it at once, which leaves the lock like any kill. A command still waiting for the lock ends at the first signal.

## Time limits

- A command waits up to 60 seconds for the lock. `status`, `unlock` and `join` take no lock, and `setup` locks only its own new folder, so it never waits.
- Each network git step has its own limit: 20 seconds for the fetch and push of `save`, `forget`, `check` and the reads, and 120 seconds for every network step of `sync`, `remote`, `setup` and `join`. A step that runs out names the git command and the time.
- Network steps by command, and the worst case as the sum of the lock wait and the limits: reads fetch once (80 s), per palace when they read every scope; `save`, `forget` and `check` fetch and push (100 s); `sync` fetches and pushes (300 s); `setup` with a remote lists the remote, fetches and pushes (360 s); `join` clones (120 s); `remote` lists the remote, fetches from it when it is not empty, fetches again and pushes (540 s).
- Local git steps have a 120-second limit each and are normally quick. A git lock file younger than 10 seconds is waited out before it is removed.
