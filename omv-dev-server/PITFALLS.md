# Pitfalls

Symptom → what it actually is → fix. Every row cost someone real time. Read this before
investigating; several of these look like a different problem than they are.

## Host and login

| Symptom | Actual cause | Fix |
|---|---|---|
| New user cannot SSH in; looks like a wrong password | `sshd` has `AllowGroups root` / `AllowGroups _ssh`; the user is in neither | Add to `_ssh`. Note the underscore — a group called `ssh` does not exist on Debian 12+ |
| `command not found` for something in `~/bin`, but the file is there and executable | Home was created with `mkdir`, not seeded from `/etc/skel`, so there is no `~/.profile`. A login shell reads `.profile`, not `.bashrc` — and Debian's `.profile` is what sources `.bashrc` and adds `~/bin` to `PATH` | Copy `/etc/skel/.profile`, `.bashrc`, `.bash_logout` into the home |
| Shell is `/usr/bin/sh` despite choosing bash in the OMV UI | The UI's shell field did not apply | `usermod -s /bin/bash <DEV_USER>` |
| Server accepts the public key, authentication still fails | The private key has a passphrase. From PowerShell, `ssh-keygen -N '""'` sets the passphrase to the two literal characters `""` | `ssh-keygen -p -P '""' -N '' -f <key>` from bash. The public key is unchanged, so `authorized_keys` stays valid |
| Config edited by hand reverts | OMV regenerates users, shared folders and compose files from its own database on apply | Edit through the UI, or work outside OMV's tree |
| Mobile SSH session dies whenever it idles | `ClientAliveInterval 0` — no keepalive, so carrier NAT drops the mapping silently | Set `ClientAliveInterval 60`; run work inside `tmux` so a drop stops mattering |
| `ping` to the NAS fails but SSH works | ICMP filtered. Ping is not a reachability test here | Test the port: `Test-NetConnection <host> -Port 22`, or `nc -z` |
| Share invisible in Windows Explorer's Network list | Network profile is Public (discovery off), and Windows 11 dropped the SMB1 browsing that used to find Samba hosts | Type `\\<NAS_LAN_IP>\<share>` directly, or map a drive. Browsing is what is broken, not the protocol |

## Containers

| Symptom | Actual cause | Fix |
|---|---|---|
| Files in the mounted repo are owned by `root` on the host | The container, or a `docker exec` into it, ran as root | `--user "$(id -u):$(id -g)"` on **both** `run` and `exec` — `exec` does not inherit it |
| `Device or resource busy` writing a config file | A single file is bind-mounted; saves happen by temp-file-and-rename, which needs a directory | Mount the parent directory instead |
| Host never sees a file the container wrote | Same inode problem, silent variant: the rename succeeded onto a new inode inside the container | Mount the directory |
| Attach fails: `chdir to cwd "…" … no such file or directory` | A container with that name exists but was started with a different mount layout | Name containers by full relative path, and test the workdir exists before `exec` |
| All repos share one pile of agent memory | Each repo was mounted at `/workspace`, so every project key is `-workspace` | Mount the repo **root**, reproduce the sub-path in `-w` |
| Copied agent memory is ignored on the new host | Project keys encode the old absolute path | Rename each key to match the new container path |
| `Ignoring N permissions.allow entries … not trusted` | Path-key mismatch in `~/.claude.json` | Fix the key with all sessions closed; a live session rewrites the file on exit |
| Container vanished after typing `exit` | It was started with `--rm`, so ending PID 1 deleted it | Use a named persistent container; detach with `Ctrl-P Ctrl-Q` |
| Session still running hours after the terminal was closed | Closing a terminal detaches the pty; it does not stop the process | `docker top <name>` to see it; kill by PID |
| Headless Chrome crashes immediately | Docker's default `--shm-size` is 64m | `--shm-size 1g` |
| Agent stalls spawning processes | `--pids-limit` too low; a coding agent runs a daemon plus pty hosts | 512, not 100 |

## Agent push and PR

| Symptom | Actual cause | Fix |
|---|---|---|
| `gh: command not found` | Not in the image. Nothing to do with auth | Install it, pinned |
| `could not read Username …: No such device or address` | No credential helper *and* no TTY. The wording describes the absent terminal, not a broken mount | System-scope helper + `GIT_TERMINAL_PROMPT=0` |
| `could not write config file …/.gitconfig: Device or resource busy` | `gh auth setup-git` writing to a bind-mounted file | Set the helper at `--system` scope in the image |
| `timeout: failed to run command 'ssh'` | No `openssh-client`, despite a key sitting in `~/.ssh` looking authoritative | Install it, or remove the decoy keys |
| `gh auth login --web` hangs and prints nothing | The device flow needs a TTY | Pass `GH_TOKEN` from the run environment |
| `GH_TOKEN` exported in one command is gone in the next | An agent's shell state does not persist between tool calls | Inject it at `docker run` |
| Auth "works" but pushes still fail | `GH_TOKEN` was passed empty; `gh` treats that as a broken credential rather than falling back | Pass the variable only when it is non-empty |
| `git ls-remote` succeeds with no credential | The repo is public — anonymous read works | Test against a private repo to prove authentication |

## Immich

| Symptom | Actual cause | Fix |
|---|---|---|
| Search, faces and object recognition silently absent | The `immich-machine-learning` service is missing from a hand-written compose | Use upstream's compose; it has four services |
| Compose edits disappear | OMV regenerates the file; its header says so | Edit via the UI, or use `compose.override.yml` |
| Database container will not start after an image change | Stock Postgres was substituted for Immich's vector-extension image | Use the image upstream pins, by digest |
| `--data-checksums` appears to do nothing | It only applies at cluster initialisation | Set before first start, or dump and restore |
| Database corruption on a NAS | The Postgres data directory is on an SMB/NFS share, which lacks the locking semantics | Local filesystem only |
| Compose warns about `version:` | Obsolete in Compose v2 | Remove it; upstream uses `name:` |
| `compose.yml` "missing" | It is a symlink to the stack-named file | Follow the link |

## Reporting a new one

Add a row here, and — if the trap is preventable rather than merely survivable — a check in
`scripts/smoke-test.sh`, so the next person gets a loud failure instead of a rediscovery.
