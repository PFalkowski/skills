# Pitfalls

Symptom → what it actually is → fix. Every row cost someone real time. Read this before
investigating; several of these look like a different problem than they are.

## Host and login

| Symptom | Actual cause | Fix |
|---|---|---|
| New user cannot SSH in; looks like a wrong password | `sshd` has `AllowGroups root` / `AllowGroups _ssh`; the user is in neither | Add to `_ssh`. Note the underscore — a group called `ssh` does not exist on Debian 12+ |
| `command not found` for something in `~/bin`, but the file is there and executable | Home was created with `mkdir`, not seeded from `/etc/skel`, so there is no `~/.profile`. A login shell reads `.profile`, not `.bashrc` — and Debian's `.profile` is what sources `.bashrc` and adds `~/bin` to `PATH` | Copy `/etc/skel/.profile`, `.bashrc`, `.bash_logout` into the home |
| Same `command not found`, but only for `ssh <host> '<cmd>'` — logging in and typing it works | A non-interactive `ssh host cmd` runs neither `.profile` nor the interactive half of `.bashrc`, so `~/bin` never reaches `PATH`. Nothing is broken | Use an absolute path from scripts, or `ssh host 'bash -lc "<cmd>"'` for a login shell |
| A launcher meant for the dev user does nothing as `root` | It lives in the dev user's `~/bin` and keys off `$HOME`. As root the repo root resolves to `/root/repos`, which does not exist, so the launcher refuses — correctly | `su - <DEV_USER>` (with the dash, so `.profile` runs). Never run it as root: the whole design rests on `--user "$(id -u):$(id -g)"`, and as root every file it writes into the repo is root-owned |
| Shell is `/usr/bin/sh` despite choosing bash in the OMV UI | The UI's shell field did not apply | `usermod -s /bin/bash <DEV_USER>` |
| Server accepts the public key, authentication still fails | The private key has a passphrase. From PowerShell, `ssh-keygen -N '""'` sets the passphrase to the two literal characters `""` | `ssh-keygen -p -P '""' -N '' -f <key>` from bash. The public key is unchanged, so `authorized_keys` stays valid |
| After a few wrong usernames, *every* connection dies with `kex_exchange_identification: Connection closed by remote host` — including ones that worked a second ago | OpenSSH 9.8+ `PerSourcePenalties`, on by default. Probing usernames earns your whole source IP a timeout (`invaliduser:5`, floor `min:15`, ceiling `max:600` seconds). The client-side message names none of this | Wait it out, then stop guessing usernames — read `getent passwd` or ask. Server side: `journalctl -u ssh \| grep srclimit_penalise` shows the penalty and its length |
| Two SSH sessions opened at the same instant, one is refused | Same mechanism, `noauth:1`, or `MaxStartups 10:30:100` on a busy box | Serialise the connections, or reuse one with `ControlMaster` |
| Config edited by hand reverts | OMV regenerates users, shared folders and compose files from its own database on apply | Edit through the UI, or work outside OMV's tree |
| Mobile SSH session dies whenever it idles | `ClientAliveInterval 0` — no keepalive, so carrier NAT drops the mapping silently | Set `ClientAliveInterval 60`; run work inside `tmux` so a drop stops mattering |
| `ping` to the NAS fails but SSH works | ICMP filtered. Ping is not a reachability test here | Test the port: `Test-NetConnection <host> -Port 22`, or `nc -z` |
| Share invisible in Windows Explorer's Network list | Network profile is Public (discovery off), and Windows 11 dropped the SMB1 browsing that used to find Samba hosts | Type `\\<NAS_LAN_IP>\<share>` directly, or map a drive. Browsing is what is broken, not the protocol |

## Storage and the data disk

Mostly for USB-attached data disks — see [HOST.md](HOST.md#if-the-data-disk-is-removable)
for the three rules these all follow from.

| Symptom | Actual cause | Fix |
|---|---|---|
| `usb N-M: device not accepting address N, error -71`, usually the tail of a burst of `reset SuperSpeed USB device` | A physical link fault on that port, connector or cable. `-71` is `-EPROTO`: re-enumeration failed at `SET_ADDRESS`. The drive itself is usually innocent | Count resets per boot to localise it: `journalctl -k -b -<N> \| grep -c 'reset SuperSpeed'`. A port that is clean for weeks and a port that resets daily is the whole diagnosis. Move the disk, keep the cable, and watch what follows it |
| Is it the bridge chip's UAS support or the cable? ASMedia and JMicron bridges have a real reputation, so the quirk is tempting | Look for SCSI error handling. `uas_eh_*` and `scsi_eh` lines mean the protocol layer failed and *asked* for the reset. Their **absence** means the reset came from the hub/xHCI layer with nothing above it complaining — physical, not protocol | Only reach for `usbcore.quirks=<vid>:<pid>:u` when error handling is actually in the log. It costs real throughput, and it fixes nothing if the connector is the problem |
| Is the drive dying? | Usually not, and SMART settles it in one command | `UDMA_CRC_Error_Count` at 0 clears the bridge-to-drive SATA path, so the fault is on the USB side of the bridge. `Reported_Uncorrect`, `Current_Pending` and `Reallocated_Event_Count` at 0 clear the media. Note `Unexpect_Power_Loss_Ct` climbing — that counts yanks, not link resets |
| `repos/` and `dev-home/` look emptied and the home symlinks dangle | The data disk unmounted and nothing brought it back. A hot replug does not re-fire the mount unit | `systemctl start "$(systemd-escape -p --suffix=mount "$DATA_DISK")"`. Check with `mountpoint -q`, never `[ -d … ]` |
| `Aborting journal` / `lost sync page write` / `Synchronize Cache(10) failed` all stamped at the second a disk was unplugged | A dirty detach with a metadata write in flight. Not a failing drive | Nothing to repair: the next mount replays the journal and reconciles the counts. `fsck -n` on the unmounted disk reports "free blocks count wrong" and `orphan_present` — that is the *unreplayed journal*, not corruption, so do not reach for a destructive `fsck`. Just mount it |
| Filesystem carried on accepting writes through a link glitch | `Errors behavior: Continue`, ext4's default | `tune2fs -e remount-ro` |
| The whole box hard-freezes; the journal simply stops mid-entry with no shutdown sequence and no error | If the OS disk is NVMe, APST parked it in a power state it does not wake from. Nothing could be logged because the root filesystem was gone — which is why the log looks fine right up to the cut | `nvme_core.default_ps_max_latency_us=0` on the kernel command line. Confirm it took with `cat /proc/cmdline` after the reboot |
| `find "$HOME/repos" …` finds nothing, though the repos are plainly there | `repos` is a symlink, and `find` does not follow symlinks named on the command line | `find -L "$HOME/repos"`, or `cd` there first and `find .`. Bites every script that trusts the symlinks HOST.md tells you to create |

## Containers

| Symptom | Actual cause | Fix |
|---|---|---|
| Files in the mounted repo are owned by `root` on the host | The container, or a `docker exec` into it, ran as root | `--user "$(id -u):$(id -g)"` on **both** `run` and `exec` — `exec` does not inherit it |
| Prompt reads `I have no name!`, and `ssh` dies with `No user exists for uid 1001` before it looks at any key | `--user` handed the container a uid the image has no `/etc/passwd` entry for. Anything calling `getpwuid()` fails hard rather than degrading, so git-over-SSH is dead. The prompt is the only hint, and it reads as cosmetic | Generate a passwd file — the image's own plus a line for your uid — and mount it `:ro` at `/etc/passwd`. Read-only keeps it clear of the single-file-mount rule, which is about writes. Point the entry's home at the container `HOME`: `ssh` reads the home from passwd, not `$HOME` |
| Bind source does not exist, and the container gets a *directory* where a file should be | Docker creates a directory at a missing bind source rather than failing | Guard every single-file mount with `[ -s "$file" ]`. Mounting a directory over `/etc/passwd` breaks every lookup instead of only the missing one |
| `Auto-update failed: no write permission to npm prefix` | Same root cause as the passwd row: the image installs tools as root under `/usr`, npm's prefix *is* `/usr`, and the container runs as an arbitrary uid. The message names the prefix, not the reason | Point npm at the container home — the one place both writable and persistent — with `prefix=${HOME}/.npm-global` in `.npmrc`, and prepend `$HOME/.npm-global/bin` to `PATH`. An update then survives `--recreate`; chowning a path inside the image does not |
| A `PATH` set in the home's `.bashrc` works after `dev`, but not under `bash -l` (or the reverse) | A login shell reads `.profile`; an interactive one reads `.bashrc`. A launcher that produces both shapes needs both files | Put the real content in `.bashrc` and have `.profile` source it, as Debian's skel does. Test both shells — and give the test a TTY, or an interactive shell exits before running anything and proves nothing |
| The image's `ENV PATH` is correct under `docker run … cmd` and **wrong** under `bash -l` | Debian's `/etc/profile` assigns `PATH` unconditionally rather than appending, so a login shell discards whatever the Dockerfile's `ENV PATH` set. Verified: `sh -c` and `bash -c` see the image's value, `bash -lc` sees `/usr/local/sbin:…` | Never rely on `ENV PATH` alone for something a login shell needs. Set it in the home's `.bashrc` as well — `.profile` is read *after* `/etc/profile`, so sourcing `.bashrc` from there wins |
| `Please tell me who you are` on the first commit inside a container | The shared container home has an empty `.gitconfig`. An image built for an arbitrary uid cannot carry an identity, and the launcher only copies the host's if the target is absent — a zero-byte file counts as present | `git config --file <DEV_HOME>/.gitconfig user.name`/`user.email` once. It is on the shared home, so every container inherits it |
| `Device or resource busy` writing a config file | A single file is bind-mounted; saves happen by temp-file-and-rename, which needs a directory | Mount the parent directory instead |
| Host never sees a file the container wrote | Same inode problem, silent variant: the rename succeeded onto a new inode inside the container | Mount the directory |
| Attach fails: `chdir to cwd "…" … no such file or directory` | A container with that name exists but was started with a different mount layout | Name containers by full relative path, and test the workdir exists before `exec` |
| All repos share one pile of agent memory | Each repo was mounted at `/workspace`, so every project key is `-workspace` | Mount the repo **root**, reproduce the sub-path in `-w` |
| Copied agent memory is ignored on the new host | Project keys encode the old absolute path | Rename each key to match the new container path |
| Memory was migrated, the keys are right, the files are on disk — and the agent still starts empty | The launcher's `DEV_HOME_DIR` is not the directory you migrated **into**. Easy to end up with two: an early hand-rolled launcher mounts one home, the migration fills a different one. The tell is that the populated home has no `sessions/` or `history.jsonl`, while the one with real session history has a single `-workspace` key | Make the launcher's default and the migration target the same path, once. Then delete the loser rather than leaving it to be rediscovered |
| `env: 'bash\r': No such file or directory` running any script from this skill | The file was copied from a Windows checkout carrying CRLF. `.gitattributes` fixes future checkouts but does not rewrite a working tree checked out before it existed | `git add --renormalize .` on the Windows side, or `sed -i 's/\r$//'` on the box. Prefer `git clone` on the NAS over `scp` from Windows |
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
| `could not read Username for 'https://github.com': terminal prompts disabled` against a repo that is definitely **public**, succeeding on maybe one attempt in six | GitHub throttles *unauthenticated* git and answers with a **401 credential challenge** rather than a 429. The error therefore names a missing password when the real cause is too many anonymous requests. `curl` to the same URL returns 200 throughout, so git, the credential helper and the container all look guilty in turn | `gh auth login`. Anonymous is 60 requests/hour; authenticated is 5000. The tell is intermittency — see the note below on running a fault more than once |
| An agent in a fresh container cannot clone anything private, and adding a token to the NAS feels like the only way | Cloning *from* the box needs a credential *on* the box. For the initial seed it does not have to | Seed by `git bundle` from a workstation that already has the repos and the credentials — see [DEVCONTAINER.md](DEVCONTAINER.md). No credential moves, and it works for any forge rather than GitHub alone |

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

**Run the fault more than once before you write down its cause.** An intermittent failure
read from a single attempt invents a deterministic explanation, and the next person inherits
it as fact. The GitHub throttling row above was blamed on the credential helper, and then on
the global gitconfig, because each was "confirmed" by one run that happened to pass after
the change. Six identical runs gave `FAIL FAIL FAIL OK FAIL FAIL`, and both explanations
evaporated. If a change appears to fix something, repeat the *unfixed* case too.
