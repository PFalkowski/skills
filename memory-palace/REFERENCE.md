# memory-palace command reference

Read this before `setup`, `join` or `remote`, or when you need a limit or a result field that [SKILL.md](SKILL.md) does not show. Every command runs as `node <skill-dir>/scripts/palace.js <command> [--palace <dir>]`, with its input as one JSON object on standard input through a quoted heredoc.

## Places and limits

- A place is segments joined by `/`: no leading or trailing `/`, no empty segment, no `.` or `..` segment, no control character. At most 256 characters and 16 segments.
- `title` at most 120 characters, `summary` 400, `text` 32,000, `kind` 32. All five `save` fields are required strings.
- `browse` with a place returns that place and everything under it, in place order. `list` returns segment names, not full places.
- `saved` is the time of the save, as an ISO 8601 timestamp.

## setup

`setup --palace <dir>` (the flag is required):

```sh
node <skill-dir>/scripts/palace.js setup --palace ~/memory-palace <<'EOF'
{"backend": "folder", "passphrase": {"env": "MEMORY_PALACE_PASSPHRASE"}, "kinds": ["decision", "preference"], "moments": ["on-request", "end-of-task"]}
EOF
```

- `backend`: `"folder"` or `"sqlite"`.
- `passphrase`: `null` for an unprotected palace, `{"env": "<variable name>"}`, or `{"file": "<key file path>"}`. The variable or file must already hold a non-empty passphrase. One trailing newline in a key file is ignored.
- `kinds`: a list of strings. `moments`: a list drawn from `on-request`, `after-decision`, `end-of-task`.
- Optional: `"remote": "<url>"` (folder backend only) and `"private": true` when the user confirmed the remote is private.
- With a remote, this machine records its URL. Every later command refuses the palace while its `.git/config` names another origin, or names one when this machine recorded none.
- Result: `{palace, default}`, and `warning` when the push did not happen (an unconfirmed remote, or a push that failed) or a protected palace sits in a git repository that does not ignore it. The new palace becomes this machine's default.
- A remote that cannot be reached, or is not empty, refuses the setup, and nothing is written.
- An unprotected palace inside a git repository that does not ignore it is refused, unless it is set up with a remote, which gives it a repository of its own: ignore the folder there, choose another folder, or turn on protection.

## join

`join --palace <dir>` registers a palace on this machine:

```sh
node <skill-dir>/scripts/palace.js join --palace ~/memory-palace <<'EOF'
{"remote": "git@github.com:<owner>/<repo>.git", "passphrase": {"env": "MEMORY_PALACE_PASSPHRASE"}}
EOF
```

- When `<dir>` is absent or empty, `join` clones `remote` into it. When `<dir>` already holds a palace, `remote` may be left out and nothing in the folder changes.
- `passphrase` has the same shape as in `setup`, and is `null` for an unprotected palace. A protected palace is checked against it. A passphrase given for a palace whose settings say it is not protected is refused, and `join` never clears this machine's record that a palace is protected.
- On a folder that already holds a palace, `join` records its passphrase source again, which is the fix when this machine's record has none.
- For a folder this machine did not know, `join` records the palace's remote URL: the one it cloned from, or the origin the folder's `.git/config` names. For a known folder it keeps the recorded URL, and refuses when the folder's origin differs from it.
- Result: `{joined, default}`. A folder this machine did not know becomes the default; a known one keeps the current default.

## remote

Adds a git remote to a folder palace, or moves it to another URL, and pushes:

```sh
node <skill-dir>/scripts/palace.js remote <<'EOF'
{"url": "git@github.com:<owner>/<repo>.git", "private": true}
EOF
```

- Pass `"private": true` only after the visibility check and the user's confirmation in [SKILL.md](SKILL.md). A protected palace pushes without it.
- Result: `{remote, synced}`, and `warning` when the push did not happen. The remote must be empty, or hold this palace's own history.
- `remote` records the URL on this machine. It is the one command that runs on a palace whose origin is not the recorded one; `status`, `join` and the others refuse it.
- The URL is at most 2,048 characters with no control characters. A URL with a password, a token, a query, a fragment or a `::` form is refused.
- Commits carry the author `memory-palace` and the current time, whatever the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables say. Git never prompts on the terminal.
- The palace's `.git/config` may hold only the keys that `git init`, `git clone` and `git remote add` write; any other key, `include.*` among them, is refused. On systems other than Windows, `.git` and `.git/config` must be owned by the user.

## Other result fields

- `save` reports `synced: true` only after a push succeeded; an offline palace, or one whose `.git` has no origin, reports `false`. `save`, `forget` and `check` add `warning` when the push did not happen. Reads add `warning` when the fetch failed or the remote holds foreign files; the answer then comes from the local copy.
- `forget` on a palace with a remote adds `note`: git history still holds earlier versions.
- `unlock` on a SQLite palace returns `{removed: null, note}`.
- `recall`, `browse` and `list` do not clean up the pages of a write that was killed or is still running; the next `save`, `forget`, `check`, `sync` or `remote` does.
- On SIGINT or SIGTERM while it holds the lock, a command finishes and exits with its own code. A second signal ends it at once, which leaves the lock like any kill. A command still waiting for the lock ends at the first signal.

## Time limits

- A command waits up to 60 seconds for the lock. `status`, `unlock` and `join` take no lock, and `setup` locks only its own new folder, so it never waits.
- Each network git step has its own limit: 20 seconds for the fetch and push of `save`, `forget`, `check` and the reads, and 120 seconds for every network step of `sync`, `remote`, `setup` and `join`. A step that runs out names the git command and the time.
- Network steps by command, and the worst case as the sum of the lock wait and the limits: reads fetch once (80 s); `save`, `forget` and `check` fetch and push (100 s); `sync` fetches and pushes (300 s); `setup` with a remote lists the remote, fetches and pushes (360 s); `join` clones (120 s); `remote` lists the remote, fetches from it when it is not empty, fetches again and pushes (540 s).
- Local git steps have a 120-second limit each and are normally quick. A git lock file younger than 10 seconds is waited out before it is removed.
