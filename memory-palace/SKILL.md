---
name: memory-palace
description: 'Keep a memory palace for the user: save, recall, browse and forget memories by place, optionally encrypted.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# memory-palace

A palace is a folder of memories, each stored at a place such as `work/billing/decisions`. Every command is:

```sh
node <skill-dir>/scripts/palace.js <command> [--palace <dir>] <<'EOF'
{ one JSON object }
EOF
```

`<skill-dir>` is the folder that holds this file. Without `--palace`, a command uses the machine's default palace. The result is one JSON line on standard output, exit 0. An error goes to standard error with exit 1, or exit 2 for a usage error. Read [REFERENCE.md](REFERENCE.md) before you run a command whose input or output this file does not show, and before `setup`, `join` or `remote`.

## Rules for every command

- Put places, titles, summaries and texts only in the JSON on standard input, through a quoted heredoc (`<<'EOF'`), never as arguments. Pick a delimiter that does not occur in the content.
- Run commands one at a time, in the foreground, with a tool timeout of at least 5 minutes. A command waits up to 60 seconds for the lock, and git steps can take 2 minutes more.
- A command that timed out or was moved to the background is still running. Wait for it to finish before you end the turn, and never run `unlock` for it.
- Show the user any `warning` or `note` in a result.
- Never delete, move or edit files in the palace folder by hand. `unlock` is the only way to remove the lock.

## First, always

Run `status` (no input). On `{"palace": null}`:

- If the user asked to set up or use a memory palace, ask the setup questions below.
- Otherwise say in one line that no memory palace is set up, leave the request to the harness's own memory, and stop.

Never set up a palace unasked, under any autonomy setting.

## Setup questions

Ask, and record the answers through `setup` (shapes in [REFERENCE.md](REFERENCE.md)):

1. **Where:** a folder that is absent or empty, whose parent folder exists.
2. **Backend:** `folder` (default; can sync through git) or `sqlite` (one database file; needs a Node with `node:sqlite`; cannot have a remote).
3. **Protection:** encrypted or not. If encrypted, where the passphrase comes from: the name of an environment variable, or the path of a key file outside the palace. The user sets the value; never ask for it in chat. Tell the user to `chmod 600` a key file, and that a lost passphrase loses the palace.
4. **Remote:** none, or a git repository URL (folder backend only).
5. **Kinds:** which kinds of things to remember, such as `decision` or `preference`.
6. **Moments:** when to save: `on-request`, `after-decision`, `end-of-task`.

Kinds and moments are stored in clear, so they name categories, never secrets. A palace that already exists elsewhere (on a remote or in a folder this machine does not know) is opened with `join`, not `setup`.

## Using the palace

- **"Remember this"**, when a palace exists, goes to the palace only, not to the harness's memory. Tell the user the place you saved it at.
- **When to save:** only at the recorded moments, and only things of the recorded kinds, unless the user asks.
- **When to read:** when the user asks what is remembered, or the task touches a subject the palace holds. Run `list` or `browse` to find places, then `recall` the ones you need.
- **Places:** segments joined by `/`. Reuse rooms that `list` shows. Saving to a place that holds a memory replaces it (`"replaced": true`); `recall` it first unless the user asked to replace it.

| Command | Standard input | Result |
|---|---|---|
| `status` | none | `{palace, backend, protected, online, remote, privateRemote, kinds, moments}` or `{"palace": null}` |
| `save` | `{"place", "title", "summary", "text", "kind"}` | `{saved, replaced, synced}` |
| `recall` | `{"place"}` | `{found: true, place, title, summary, kind, saved, text}` or `{found: false}` |
| `browse` | `{}` or `{"place"}` | `{memories: [{place, title, summary, kind, saved}]}`: the place and everything under it, no texts |
| `list` | `{}` or `{"place"}` | `{children: [names]}`: the segments one level below |
| `forget` | `{"place"}` | `{forgot, found}`; exact place only |
| `sync` | none | `{synced: true}` |
| `check` | none | `{memories, height, nodes, unreachableRemoved}` |
| `unlock` | none | `{removed: <holder record> \| "unreadable" \| null}` |

`setup`, `join` and `remote` are in [REFERENCE.md](REFERENCE.md).

## Passphrase

The passphrase lives only in the environment variable or key file recorded at setup. Never put it on a command line, in chat, in a memory or in the palace folder, and never print the variable. The CLI refuses `--passphrase` and `--password`.

## Remote

- The user creates the remote repository empty: no README, license or `.gitignore`.
- A palace that already lives on a remote is opened with `join` into a new folder.
- An unprotected palace pushes only to a remote confirmed private. Before you pass `"private": true`, check the repository's visibility (for GitHub, `gh repo view <owner>/<repo> --json visibility`) and ask the user to confirm.
- Never put a token or password in the URL; use a credential helper or ssh.
- `forget` on a synced palace leaves earlier versions in git history; tell the user.

## Stopping conditions

- **"busy: <palace>/lock is held by ..."** (folder palace): run `unlock` yourself only when you know no other session uses this palace and the named command is dead: it was stopped or killed, not timed out or backgrounded. Otherwise show the message, and run `unlock` only after the user confirms that no memory-palace command is running on any machine that uses this palace. Then retry. An `unlock` while a command still runs can corrupt the palace and lose memories.
- **"busy: another memory-palace command is using ... palace.db"** (SQLite palace): retry later. `unlock` does nothing there.
- **"the lock was removed while this command ran"**: nothing more was changed. Tell the user, run `check`, then retry. A `warning` that the lock was removed while the command held it means the result stands; run `check`.
- **"saved in the palace files, but <step> failed"**: the change is kept and the next command finishes it. Tell the user. Do not save again.
- **"the remote holds files memory-palace did not write"**: on a read, say the answer comes from the local copy. Otherwise do not save or sync until the user removes those files where the message says.
- **"the remote is not empty"**: offer `join`, or a new empty repository.
- **"this palace and its remote have both changed"**: stop and show the message. Offer its way out, a `join` into a new folder. Leave the diverged folder as it is.
- **"... not yet synced"** or **"the push waits"**: the change is saved locally. Follow the message: fix the remote, or confirm it private as above, then `sync`.
- **Wrong passphrase, a damaged or missing page, a settings mismatch, an unknown format, a git configuration error, or `node:sqlite` missing**: stop and show the error. Do not retry with other settings.
- **A refused setup** (folder not empty, inside a git repository that does not ignore it, a URL with a secret, a SQLite palace with a remote): show the message and ask the user to choose again.
- **A leftover `.<name>.setup-<hex>` folder** beside the palace is a killed `setup` or `join`. It holds no memories; the user may delete it.
- **After a power loss or an operating-system crash**: run `check` before anything else, and tell the user if it fails. The palace is built to survive a killed command, not a power loss.

## What protection covers

Tell the user this when they choose protection, and whenever they ask.

- Protection encrypts the palace at rest: its files, the git copy and the remote. It does not hide how many memories there are, how large they are or when they changed. Each memory is encrypted whole, its place and kind included; the settings, with the lists of kinds and moments, are not.
- It does not guard against the agent or any program that holds the passphrase. Other programs running as the same user can read the passphrase variable or key file.
- Whatever the agent saves or recalls passes through the conversation. The harness keeps it in clear in its session transcripts, and the shell command line holds the input while a command runs.
- Crash dumps, swap and hibernation can hold decrypted memories, the key and the passphrase.
- A lost passphrase loses the palace. `forget` does not erase earlier versions from git history or backups.
- The lock cannot fully guard against an `unlock` while a command runs, two machines writing through a synced or network folder, or someone deleting the lock file. Each can corrupt the palace and lose memories. Write from one machine at a time.
- The recorded moments apply only in sessions where this skill is loaded.
