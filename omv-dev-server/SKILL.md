---
name: omv-dev-server
description: 'Set up or repair OpenMediaVault hosting with Docker, Tailscale and agent-ready dev containers.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# OMV dev server

Scripts are safe to re-run for setup or repair. Read the relevant references when needed.

```bash
cp scripts/setup.env.example scripts/setup.env   # fill in host, user, disk
scripts/setup.sh --check                          # read-only
scripts/setup.sh
```

On existing hosts, run `--check` first to establish missing components and applicability.

| Reference | Read for | Scripts |
|---|---|---|
| [HOST.md](HOST.md) | OMV, users/groups, storage and removable disks | `10-dev-user.sh`, `20-storage.sh` |
| [REMOTE.md](REMOTE.md) | Tailscale, HTTPS, SSH, Termius/tmux | `30-remote-access.sh` |
| [IMMICH.md](IMMICH.md) | OMV Compose-managed Immich; no hand-editing generated compose files | `40-immich.sh` |
| [DEVCONTAINER.md](DEVCONTAINER.md) | Images, launcher, per-repo containers, persistent agent memory | `50-dev-image.sh`, `60-launcher.sh`, `dev` |
| [AGENT-AUTH.md](AGENT-AUTH.md) | Noninteractive `git push`/`gh pr create` | `Dockerfile`, `dev` |
| [PITFALLS.md](PITFALLS.md) | Read first for failures: symptom, cause, fix | `smoke-test.sh` |

## Invariants

1. **Mount directories, not individual read-write files.** Docker binds inodes; temp-file-and-rename saves either disappear from the host or fail with `Device or resource busy`.
2. **Keep container paths stable.** Claude Code keys project memory, trust, and permissions by absolute cwd; moving it silently ignores that data.
3. **Configure noninteractive authentication in advance.** The agent has no terminal; credential/device/confirmation prompts hang. Make failure messages explicit.
4. **Respect OMV ownership.** Its database regenerates UI-managed users, shared folders, and Compose files. Use the UI or work entirely outside its tree.

Keep real values in gitignored `scripts/setup.env`. Documentation uses `<NAS_HOST>`, `<NAS_LAN_IP>`, `<NAS_TS_NAME>`, `<TAILNET>`, `<DEV_USER>`, `<DISK_UUID>`, `<DATA_PART>`, `<GIT_OWNER>`, `<REPO>`; never real hostnames, addresses, or keys.

Record reusable traps in [PITFALLS.md](PITFALLS.md), adding a `smoke-test.sh` check when preventable. Machine-specific findings stay in private notes.
