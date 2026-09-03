# The dev container

A container per repository, running as you, with a persistent home — so an agent working
inside it keeps its memory, its credentials, and its file ownership straight.

## Mount the repo *root*, not the repo

This is the decision everything else depends on, and the obvious version is wrong.

The tempting launcher mounts the current directory: `-v "$PWD:/workspace"`. It works, and it
quietly destroys per-project memory. Claude Code derives its project key from the absolute
working directory — take the path and replace every `:`, `\`, `/` and `.` with `-`:

```
/workspace/<GIT_OWNER>/<REPO>   ->   -workspace-<GIT_OWNER>-<REPO>
```

Mount each repo at `/workspace` in turn and **every repo produces the same key**,
`-workspace`, so all their memories merge into one undifferentiated pile. Mount the repo
*root* once and reproduce the sub-path instead:

```bash
-v "$REPO_ROOT:/workspace"  -w "/workspace/<relative path from the root>"
```

Now each repo has a distinct, stable key. Stable is the second benefit: the container path
no longer depends on where the host keeps the files, so moving disks or renaming a share
does not invalidate anything.

The same rule governs `~/.claude.json`, which stores trust and permission grants per
absolute path. A path mismatch there does not error — it silently ignores your allow-list
and prints `Ignoring N permissions.allow entries`. Edit that file only with every session
closed; a running session rewrites it on exit and clobbers the change.

### Migrating memory from another machine

The keys encode the old absolute paths, so a straight copy lands data under keys that match
nothing. Rename each directory to the new key as you copy:

```
~/.claude/projects/<old-key>/memory/   ->   ~/.claude/projects/-workspace-<GIT_OWNER>-<REPO>/memory/
```

Copy only the `memory/` directories. The rest of `projects/` is session transcripts, which
on an active machine is three orders of magnitude larger and of no use on the new host.

Transcripts are also where secrets accumulate. A token that only ever lived in one repo's
`.git/config` ends up quoted in every session that ran `git remote -v`, so copying
`projects/` wholesale moves the leak onto the NAS along with it. One more reason to take
`memory/` and nothing else.

**Migrate into the directory the launcher actually mounts.** It is easy to finish with two
homes — an early hand-rolled launcher pointing at one, the migration filling another — and
the symptom is an agent that starts with no memory at all while two hundred files sit on disk
under perfectly correct keys. Settle `DEV_HOME_DIR` first, migrate second, and delete the
loser rather than leaving it for someone to rediscover.

## Seeding the repos without putting a credential on the box

The repos have to exist at the paths those memory keys encode before any of the memory is
worth anything. Cloning them *from* the NAS means a credential *on* the NAS — a token in the
environment, or a key registered with every forge you use. For the initial seed there is a
better route: your workstation already has the repos, and already has working credentials.

```bash
# on the workstation, per repo
git -C <repo> fetch --all
git -C <repo> bundle create /tmp/<REPO>.bundle --all
scp /tmp/<REPO>.bundle <DEV_USER>@<NAS_LAN_IP>:/tmp/

# on the NAS, into the exact sub-path the memory key encodes
dest="$REPO_ROOT/<GIT_OWNER>/<REPO>"
git clone /tmp/<REPO>.bundle "$dest"
git -C "$dest" remote set-url origin <real-origin-url>
```

Why this beats a token for a one-time seed:

- No credential moves, and none is left behind to rotate later.
- One mechanism for every forge. A `GH_TOKEN` only ever solves GitHub; a bundle moves an
  Azure DevOps or self-hosted repo with exactly the same two commands.
- `--all` carries every branch and tag, so this is a real clone, not a shallow snapshot.
- On a LAN it is quick — a bundle is about the size of the packed history, typically a
  fraction of the working `.git`.

Two things to correct straight afterwards. `origin` points at the bundle file until you reset
it, so do that in the same breath. And the clone checks out whichever branch `HEAD` had on
the workstation, with remote-tracking refs that came from the bundle — one `git fetch`
reconciles them against the real remote.

The agent still needs a credential to **push**. That is [AGENT-AUTH.md](AGENT-AUTH.md), and
it stays a separate decision from how the code first arrived.

## Name containers by path, not by basename

A launcher that names the container `dev_$(basename "$PWD")` collides the moment two repos
share a directory name. The failure is not obvious: it *attaches* to the wrong container and
you get a raw runtime error about a missing working directory. Derive the name from the full
relative path — `dev_<GIT_OWNER>_<REPO>` — and check before attaching:

```bash
docker exec "$NAME" test -d "$WORKDIR" || { echo "different mount layout:"; docker inspect ...; exit 1; }
```

## Run as yourself

```bash
--user "$(id -u):$(id -g)"  -e HOME=/dev-home
```

Without it the container runs as root and every file it writes into the mounted repo is
root-owned on the host — which breaks editing from a file share and is tedious to undo. The
image must therefore not assume `/root` or a named account; `HOME` is injected at runtime.

Pass `--user` to `docker exec` too. It defaults to the image's user, not the running
container's, so an exec into a `--user`-launched container can still land as root.

### Give that UID a passwd entry, or SSH is dead

`--user 1001:100` hands the container a uid the image has never heard of. The prompt says
`I have no name!`, which reads as cosmetic and is not: anything calling `getpwuid()` fails
hard rather than degrading, and `ssh` is the one that matters.

```
$ ssh -T git@github.com
No user exists for uid 1001
```

That is `ssh` exiting *before* it reads your key, so every SSH remote is unreachable and the
message names neither the container nor the cause. Generate a passwd file — the image's own,
plus one line for you — and mount it read-only:

```bash
passwd_line="$(id -un):x:$(id -u):$(id -g):dev container user:/dev-home:/bin/bash"
{ docker run --rm "$IMAGE" cat /etc/passwd && echo "$passwd_line"; } > "$DEV_HOME/.container-passwd"
args+=( -v "$DEV_HOME/.container-passwd:/etc/passwd:ro" )
```

Three details carry weight. Start from the **image's** `/etc/passwd` rather than writing one
line, or you delete `root` and `nobody` and break more than you fixed. Point the entry's home
at the container `HOME`, because `ssh` takes the home directory from the passwd entry and not
from `$HOME` — get this wrong and it looks for keys somewhere that does not exist. And mount
it **read-only**, which is what keeps this clear of the never-mount-a-single-file rule above:
that rule exists because *writes* land on an inode the host never sees, and nothing writes
here.

Guard the mount with `[ -s "$file" ]`. Docker creates a *directory* at a bind source that
does not exist, so a failed generation would put a directory over `/etc/passwd` and break
every lookup rather than only the missing one.

A working result still fails to authenticate — `Permission denied (publickey)` — until the
key is registered. That is the correct error, and it is the one that tells you this is fixed.

### Give self-updating tools somewhere to write

The same root cause, one layer up. Everything baked into the image is installed as root
under `/usr`, so a tool that updates itself in place has nowhere it may write:

```
✘ Auto-update failed: no write permission to npm prefix
```

npm's prefix is `/usr`, and you are not root. The message names the prefix and not the
reason, so it reads as a broken install.

Chowning a path inside the image is the obvious fix and the wrong one: it lives in the
container filesystem, so `dev --recreate` or a rebuilt image discards it and the problem
returns. Point npm at the container **home** instead, which is the one directory that is
both writable by you and persistent across recreation:

```
# ~/.npmrc — npm expands ${HOME}, and the home is set at runtime
prefix=${HOME}/.npm-global

# ~/.bashrc — prepended, so a self-updated tool shadows the image's root-owned copy
export PATH="$HOME/.npm-global/bin:$PATH"
```

`dev` seeds both, plus a `.profile` that sources `.bashrc`, and seeds each only when absent
so your own edits survive. The image's pinned copy stays where it was: delete
`~/.npm-global` and you fall straight back to it.

**This is a deliberate exception to pinning.** The rule above says pin what you can, because
an unpinned CLI changing under an unchanged Dockerfile is a nasty regression to trace. An
agent CLI is the case where being several versions behind on a remote box is the worse
failure. Decide it per tool rather than by default, and if you would rather hold the pinned
version, set `DISABLE_AUTOUPDATER=1` and update by rebuilding.

One trap when checking this. `dev` gives you an *interactive non-login* shell, which reads
`.bashrc`; `bash -l` reads `.profile`. Test both, and give the test a real TTY — an
interactive shell without one exits before running anything and appears to prove your
change did nothing.

## One home directory, never single files

Mount the whole home, not `~/.gitconfig` and `~/.claude.json` individually:

```bash
-v "$DEV_HOME:/dev-home"
```

Docker binds a single file by inode. Git — and most editors — save by writing a temp file
and renaming it over the target, which lands on a *new* inode the host never sees, or fails
outright with `Device or resource busy`. Mounting the directory sidesteps the whole class.

Seed `$DEV_HOME` by copying credentials in rather than mounting the host's. A compromised
container then cannot rewrite your real keys, and the copy can hold a dedicated deploy key.

## Resource limits

A dev container on a NAS shares the box with services people rely on:

```bash
--init                     # reap zombies; node and git leave them and PID 1 will not
--memory 8g                # sized to the box, leaving room for the NAS itself
--pids-limit 512           # Claude Code spawns a daemon plus pty hosts; 100 is too low
--shm-size 1g              # headless Chrome dies on Docker's 64m default
--security-opt no-new-privileges
```

`--memory`, `--pids-limit`, and `--shm-size` are `scripts/dev`'s defaults
(`DEV_MEMORY`, `DEV_PIDS`, `DEV_SHM`); set the matching env var to override
any of them for a box with different resources.

## Container lifecycle

Prefer a **named, persistent** container over `--rm`:

- `docker run` when it does not exist, `docker start` when it is stopped, `docker exec` when
  it is running. Sessions survive a reboot and an accidental disconnect.
- `--rm` looks tidy and sets a trap: the container is destroyed the moment its main process
  exits, so typing `exit` in an attached shell deletes a container that may be hosting a
  live agent session. There is no `docker start` afterwards.
- Recreating on demand (`dev --recreate`) is how you pick up a rebuilt image. Make it
  explicit rather than implicit.

### Attaching to a live session

`docker attach` connects to **PID 1's** terminal — the shell an agent is running in, which
is what you want when reconnecting to a live session. Two rules:

- Detach with `Ctrl-P Ctrl-Q`. Not `Ctrl-C` (that signals the running process) and not
  `exit` (that ends PID 1, and with `--rm` deletes the container).
- `docker exec -it <name> bash` opens a *separate* shell instead. Safe to exit, but it does
  not show the running session.

Closing a terminal only detaches the pty; the session keeps running and keeps burning CPU.
Audit for long-lived containers periodically — `docker top <name>` shows what is really
inside.

## The image

See [`scripts/Dockerfile`](scripts/Dockerfile). Beyond the language toolchain it installs
`git`, `openssh-client`, `jq`, `tmux`, `ripgrep`, the GitHub CLI **pinned and checksum
verified**, and the agent CLI — then wires the non-interactive auth described in
[AGENT-AUTH.md](AGENT-AUTH.md) and ends with a build-time smoke test so a future edit that
drops one of them fails the build instead of someone's push.

Pin what you can. An unpinned CLI changing behaviour under an unchanged Dockerfile is the
hardest kind of build regression to trace.

## Scripts

```bash
scripts/50-dev-image.sh          # build the image, run the smoke test
scripts/60-launcher.sh           # install scripts/dev to ~/bin/dev
scripts/smoke-test.sh [image]    # the cold-container checks, standalone
```
