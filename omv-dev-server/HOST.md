# Host, users, storage

OpenMediaVault on a Debian base. OMV is a NAS appliance that keeps its own configuration
database and regenerates system files from it, so the first decision on this box is *what
OMV owns and what you own*.

## What OMV owns, and what that costs you

Users, groups, shared folders and Compose files created through the OMV web UI are written
from OMV's database on every "Apply". Anything you change by hand in those files is lost at
the next apply. Two consequences worth knowing before you start:

- Create the dev user **through the web UI**, not `useradd`. Only UI-created users can
  later become Samba accounts, which is what lets one identity serve SSH, the container,
  and Windows file sharing. A `useradd` user works fine for SSH and Docker but can never
  join that set.
- Keep your dev directories **outside** OMV's shared-folder tree, or accept that OMV
  manages their ACLs. Plain directories on a data disk are simplest and OMV leaves them alone.

## Storage layout

Decide two things: which disk, and inside or outside the file-sharing export.

```
/srv/dev-disk-by-uuid-<DISK_UUID>/     # the data disk, not the OS disk
└── dev/
    ├── repos/                          # mounted into containers as /workspace   (0755)
    └── dev-home/                       # the container's HOME                     (0700)
```

Put both on a **data disk**, not the OS disk. On many OMV boxes the OS disk is small or
removable; even where it is not, keeping dev data off it means an OS reinstall costs you
nothing. Symlink them into the dev user's home so nobody types a UUID path:

```bash
ln -sfn /srv/dev-disk-by-uuid-<DISK_UUID>/dev/repos    ~/repos
ln -sfn /srv/dev-disk-by-uuid-<DISK_UUID>/dev/dev-home ~/.dev-home
```

`dev-home` is `0700` and stays out of any network share. It holds agent credentials and
all per-project memory — it is the only irreplaceable thing on the box. Back it up.

**Do not export `repos/` over SMB/NFS.** Git repositories carry credentials in
`.git/config`; a remote URL of the form `https://<token>@github.com/...` becomes a
LAN-readable file the moment the directory is shared. If you need files on a workstation,
copy them out over SSH.

### If the data disk is removable

A USB-attached disk is a removable device that everything above it treats as fixed. That
mismatch costs you three things, and only the first is obvious.

**Mount it `errors=remount-ro`.** ext4 defaults to `Continue`, which keeps issuing writes to
a filesystem the kernel can no longer reach. On a disk whose cable can wobble, that turns a
link glitch into silent corruption rather than a visible outage. One command, reversible:

```bash
tune2fs -e remount-ro /dev/<DATA_PART>
dumpe2fs -h /dev/<DATA_PART> | grep -i 'errors behavior'
```

**Unmount before unplugging.** Pulling a mounted disk aborts the journal mid-write:

```
Aborting journal on device <DATA_PART>-8.
Buffer I/O error on dev <DATA_PART>, lost sync page write
JBD2: I/O error when updating journal superblock for <DATA_PART>-8.
sd 0:0:0:0: [sdX] Synchronize Cache(10) failed: Result: hostbyte=DID_ERROR
```

The next mount replays the journal and reconciles the block counts, so an *idle* disk
survives it. One that was mid-clone or mid-backup does not. Derive the unit name rather than
typing the escaped form:

```bash
unit="$(systemd-escape -p --suffix=mount "$DATA_DISK")"
systemctl stop "$unit"      # before unplugging
systemctl start "$unit"     # after plugging back in
```

**A replug does not remount it.** `nofail` in `/etc/fstab` stops a missing disk from blocking
boot, but nothing re-fires the generated mount unit when the device reappears. The mount
point stays an empty directory, `repos/` and `dev-home/` look deleted, and the symlinks in
the dev user's home dangle in silence.

That last one has a corollary worth internalising: **`[ -d "$DATA_DISK" ]` is not a mounted
check.** The directory exists either way, so the naive guard passes on an unmounted disk and
the scripts happily rebuild your layout on the OS disk underneath the mount point. Use
`mountpoint -q`.

## The dev user

One identity for SSH, the container, and file sharing. Three group memberships matter:

| Group | Why |
|---|---|
| `_ssh` | **Required to log in at all.** See below — this is the trap. |
| `docker` | Run containers without `sudo`. Root-equivalent; see the note. |
| `users` | gid 100, the conventional OMV data group; grants access to group-writable shares |

Give the user `/bin/bash`. Then verify — see the two things the UI does not do.

### The `_ssh` group gate

Debian ships `sshd` with an `AllowGroups` restriction on many OMV builds:

```
$ sshd -T | grep -i allowgroups
allowgroups root
allowgroups _ssh
```

A user outside both groups **cannot SSH in at all**, and the failure looks like a wrong
password rather than a policy refusal. Note the name is `_ssh` with a leading underscore
on Debian 12+; checking for a group called `ssh` reports "absent" and misleads you.

### Two things the OMV UI does not do

Verify both after creating the user, because neither fails loudly:

1. **The shell may not be applied.** The UI offers a shell dropdown and can still leave the
   account on `/usr/bin/sh` (dash) — no history, no completion, and scripts that assume bash
   misbehave. Check `getent passwd <DEV_USER>` and fix with `usermod -s /bin/bash`.
2. **The home directory may not exist.** No home means no `~/.ssh` for key auth, and — the
   subtle one — no `~/.profile`. An SSH *login* shell reads `~/.profile`, not `~/.bashrc`;
   Debian's stock `.profile` is what sources `.bashrc` and what adds `~/bin` to `PATH`. With
   the home unseeded, a `PATH` line appended to `.bashrc` is never read and your launcher is
   "command not found" for reasons that have nothing to do with the launcher. Seed it:

```bash
mkdir -p /home/<DEV_USER> && chown <DEV_USER>:users /home/<DEV_USER> && chmod 750 /home/<DEV_USER>
cp /etc/skel/.profile /etc/skel/.bashrc /etc/skel/.bash_logout /home/<DEV_USER>/
chown <DEV_USER>:users /home/<DEV_USER>/.profile /home/<DEV_USER>/.bashrc /home/<DEV_USER>/.bash_logout
```

`mkdir` does not copy `/etc/skel`. Only `useradd -m` and some UI paths do.

### About the `docker` group

Adding a user to `docker` is **root-equivalent**: any member can start a container that
bind-mounts `/` and writes as root. It is the standard way to avoid `sudo` and it is what
the OMV Docker plugins assume, so it is a reasonable trade here — but it is a real grant,
not a convenience, and it should be a decision rather than a default. Rootless Docker is
the alternative and fights the omv-extras setup.

## Scripts

```bash
scripts/10-dev-user.sh --check     # report only
scripts/10-dev-user.sh             # fix shell, seed home from /etc/skel, install key, verify groups
scripts/20-storage.sh              # create the dev dirs on the data disk, set modes, symlink
```

`10-dev-user.sh` deliberately does **not** create the account — that is the one step you do
in the web UI, for the Samba reason above. It verifies and repairs everything after.
