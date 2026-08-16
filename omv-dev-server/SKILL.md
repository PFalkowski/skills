---
name: omv-dev-server
description: 'Build and run a self-hosted OpenMediaVault box that is both a NAS and an agent-ready dev server: Docker services (Immich) under the OMV Compose plugin, Tailscale for phone and off-LAN access, SSH plus Termius plus tmux for durable mobile shells, and per-repo dev containers whose agents can push and open PRs with no human at a terminal. Every step has a prose runbook and an idempotent script beside it. Use when setting up or repairing a home server, a NAS-hosted dev environment, an OMV box, Immich, Tailscale remote access, or a Docker dev container an unattended agent works inside.'
---

# OMV dev server

One box, two jobs: a NAS that stores things, and a dev server that agents work inside.
This is the runbook for building it, plus the traps that cost hours the first time.

Everything here is a **pair** — a prose section explaining *why*, and a script beside it
doing the same thing idempotently. Run the scripts to build; read the prose when something
breaks. The scripts re-run safely, so they double as a repair tool.

## Start here

```bash
cp scripts/setup.env.example scripts/setup.env   # fill in your host, user, disk
scripts/setup.sh --check                          # read-only: what is missing?
scripts/setup.sh                                  # make it so
```

`--check` never writes. Run it first on an existing box; it is also the fastest way to
see whether this skill applies to the machine at all.

## The pieces

| Read | For | Script |
|---|---|---|
| [HOST.md](HOST.md) | OMV base, the dev user, groups, storage layout, which disk gets what | `10-dev-user.sh`, `20-storage.sh` |
| [REMOTE.md](REMOTE.md) | Tailscale, HTTPS without port-forwarding, SSH hardening, Termius + tmux on a phone | `30-remote-access.sh` |
| [IMMICH.md](IMMICH.md) | Immich under the OMV Compose plugin — and why you must not hand-edit its compose file | `40-immich.sh` |
| [DEVCONTAINER.md](DEVCONTAINER.md) | The dev image, the launcher, per-repo containers, agent memory that survives the move | `50-dev-image.sh`, `60-launcher.sh`, `dev` |
| [AGENT-AUTH.md](AGENT-AUTH.md) | Letting an agent `git push` and `gh pr create` with no TTY and no interactive login | baked into `Dockerfile` + `dev` |
| [PITFALLS.md](PITFALLS.md) | Symptom → actual cause → fix. Read this one **first** when something is broken | `smoke-test.sh` |

## The four rules everything else follows from

1. **Never bind-mount a single file read-write.** Docker binds a file by inode; anything
   that saves by temp-file-and-rename — git config, most editors — writes to a new inode
   the host never sees, or fails with `Device or resource busy`. Mount the directory.
2. **Absolute paths are identity.** Claude Code keys per-project memory, and its trust and
   permission entries, off the absolute working directory. Change the path and the data is
   silently ignored rather than migrated. Fix the container path once and never move it.
3. **The agent has no terminal.** Every interactive fallback — a credential prompt, a device
   login flow, a confirmation — is a hang, not an error. Configure the non-interactive path
   ahead of time and make the failure message say so.
4. **OMV owns what OMV generates.** Users, shared folders and Compose files created through
   the web UI are regenerated from OMV's own database. Hand-edit them and your change is
   lost at the next apply. Work *with* the UI, or entirely outside its tree.

## Placeholders

Nothing here contains real hostnames, addresses or keys. Substitute:

`<NAS_HOST>` `<NAS_LAN_IP>` `<NAS_TS_NAME>` `<TAILNET>` `<DEV_USER>` `<DISK_UUID>`
`<GIT_OWNER>` `<REPO>`

`scripts/setup.env` is the one file that holds your real values, and it is gitignored.

## Keeping this current

This document is meant to be edited when it is wrong. New trap → a row in
[PITFALLS.md](PITFALLS.md) plus, if it is preventable, a check in `smoke-test.sh` so it
fails loudly next time instead of being rediscovered. Findings that are specific to one
machine belong in your own notes, not here.
