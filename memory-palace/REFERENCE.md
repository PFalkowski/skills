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
- Result: `{palace, default}`, and `warning` when the push did not happen (an unconfirmed or unreachable remote) or a protected palace sits in a git repository that does not ignore it. The new palace becomes this machine's default.
- An unprotected palace inside a git repository that does not ignore it is refused: ignore the folder there, choose another folder, or turn on protection.

## join

`join --palace <dir>` registers a palace on this machine:

```sh
node <skill-dir>/scripts/palace.js join --palace ~/memory-palace <<'EOF'
{"remote": "git@github.com:<owner>/<repo>.git", "passphrase": {"env": "MEMORY_PALACE_PASSPHRASE"}}
EOF
```

- When `<dir>` is absent or empty, `join` clones `remote` into it. When `<dir>` already holds a palace, `remote` may be left out and nothing in the folder changes.
- `passphrase` has the same shape as in `setup`, and is `null` for an unprotected palace. A protected palace is checked against it.
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

## Other result fields

- `save` reports `synced: true` only after a push; an offline palace always reports `false`. `save`, `forget` and `check` add `warning` when the push did not happen. Reads add `warning` when the fetch failed or the remote holds foreign files; the answer then comes from the local copy.
- `forget` on a palace with a remote adds `note`: git history still holds earlier versions.
- `unlock` on a SQLite palace returns `{removed: null, note}`.
- Git steps time out after 20 seconds inside ordinary commands and 120 seconds inside `sync`, `remote`, `setup` and `join`; the error then names the git command and the time.
