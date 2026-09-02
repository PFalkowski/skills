# Remote access: Tailscale, SSH, and a phone

The goal is reaching the box from anywhere without opening a single port on the router.

## Tailscale

Tailscale puts the server on a private WireGuard network. Every device that joins gets a
stable `100.x.y.z` address that works on the LAN, on mobile data, and behind NAT, with no
port forwarding and nothing exposed to the public internet.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh=false
tailscale status          # note the 100.x address and the machine name
```

Two addresses now reach the box, and it is worth knowing which you are using: the LAN
address (fast, only at home) and the tailnet address (works anywhere). Both are fine for
SSH. Prefer the tailnet name in any config you keep, so it survives a router change.

### HTTPS for a web service, without a certificate dance

`tailscale serve` fronts a local HTTP port with a real, automatically renewed TLS
certificate on a `*.ts.net` name, reachable **only** by devices on your tailnet:

```bash
tailscale serve --bg 2283          # proxies https://<NAS_TS_NAME>.<TAILNET>.ts.net -> 127.0.0.1:2283
tailscale serve status
```

That is how a phone reaches Immich: a real HTTPS URL, no port forward, no self-signed
certificate warning, no exposure to the internet. Use `tailscale funnel` only if you
genuinely want it public — that *does* expose the service, and it is a different decision.

**Do not point `serve` at a service that has no authentication of its own.** Tailnet-only
is a strong boundary, but everyone on your tailnet is inside it.

## SSH

Key authentication, and one setting that matters more on mobile than anywhere else.

```bash
ssh-keygen -t ed25519 -C "<you>@<device>"
ssh-copy-id <DEV_USER>@<NAS_TS_NAME>
```

### On OMV there are three authorized_keys files, not one

```
$ sshd -T | grep -i authorizedkeysfile
authorizedkeysfile  .ssh/authorized_keys .ssh/authorized_keys2 /var/lib/openmediavault/ssh/authorized_keys/%u
```

The third is OMV's own, written from the SSH-keys field in the user editor. For an
OMV-managed user that is the better home for a key: it lives in OMV's configuration database
and travels with its backups, which is the same rule as everywhere else — OMV owns what OMV
generates. A key placed by hand in `~/.ssh/authorized_keys` works too and is *not*
overwritten, because OMV only ever writes its own path. But it is a second place to look
when a key mysteriously does, or does not, work, and it is easy to end up with the same key
in both.

OMV's datamodel validates each entry as `"format": "sshpubkey-rfc4716"` — a bare public key.
`command="…"` and the other `authorized_keys` options are not part of that format, so a key
carrying one belongs in `~/.ssh/authorized_keys` rather than the UI field.

`StrictModes` is on, so a key in either location is ignored in silence unless the home is at
most `0755`, `~/.ssh` is `0700`, and the file is `0600` and owned by the user. Check
permissions before suspecting the key.

### Generating a key from PowerShell

`ssh-keygen -N '""'` on PowerShell does **not** produce an empty passphrase — PowerShell
passes the two quote characters literally, and the key ends up protected by a passphrase of
`""`. The symptom is confusing: the server *accepts* the public key (`debug1: Server accepts
key`) and authentication still fails, because the client cannot decrypt the private half in
batch mode. Generate from bash, or fix afterwards:

```bash
ssh-keygen -p -P '""' -N '' -f ~/.ssh/id_ed25519    # strips it; the public key is unchanged
```

Changing a passphrase does not change the key, so any `authorized_keys` entry stays valid.

### Keepalives, or your phone drops every session

Debian's default is no server-side keepalive:

```
$ sshd -T | grep -i clientalive
clientaliveinterval 0
```

With `0`, a mobile session behind carrier NAT dies silently whenever the connection idles —
the NAT mapping expires and neither end notices until you type something. Set an interval
in `/etc/ssh/sshd_config.d/10-keepalive.conf`:

```
ClientAliveInterval 60
ClientAliveCountMax 5
```

That is a 5-minute grace before the server gives up on an unreachable client, and it keeps
the NAT mapping warm. It is not a substitute for tmux — it reduces drops; tmux makes them
not matter.

### Hardening worth doing

Once key auth works from every device you care about, turn off what you no longer need:

```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

Do this **only after** verifying key login as the dev user, and keep a root console or a
second open session while you reload `sshd`. Locking yourself out of a headless box is a
trip to find a monitor.

## Termius and tmux on a phone

Termius is an SSH client for Android and iOS. Point it at the tailnet name, import the
private key, and it works from anywhere Tailscale does.

The problem is not connecting, it is *staying* connected. A phone switches networks, sleeps,
and loses the session — and with it anything running in the foreground. tmux fixes this
properly: the shell lives on the server, and the client merely attaches to it.

```bash
tmux new -A -s main        # attach if it exists, create if it does not — the only command needed
```

Put that in Termius as the host's startup command and every connection lands in the same
persistent session. Detach with `Ctrl-b d`; closing the app does the same thing implicitly.

Practical notes for a small screen:

- `tmux new -A -s <name>` is idempotent. Plain `tmux new -s <name>` fails if the session
  exists, which is exactly what happens on the second connection.
- `Ctrl-b` is awkward on a phone keyboard. Termius has a configurable key bar; add
  `Ctrl`, `Tab`, `Esc` and the arrows to it rather than rebinding the prefix, so your muscle
  memory stays the same on a laptop.
- Long agent runs belong in tmux **on the host**, not in a container's foreground — see the
  attach trap in [PITFALLS.md](PITFALLS.md).

### The config

[`scripts/tmux.conf`](scripts/tmux.conf), installed to the dev user's `~/.tmux.conf` by
`30-remote-access.sh`. Every line is there for a phone-shaped reason:

| Setting | Why |
|---|---|
| `mouse on` | Pane select and scrollback by touch. The one setting that decides whether a small screen is usable at all |
| `history-limit 50000` | You read the backlog after a reconnect, not live |
| `aggressive-resize on` | Two clients of different sizes attach constantly. Without it the laptop window shrinks to phone size the moment the phone connects |
| `base-index 1`, `pane-base-index 1`, `renumber-windows on` | `0` is the far end of a phone keyboard, and closing a window should not leave a gap you have to skip past |
| `default-terminal tmux-256color` | Colours inside the dev container are wrong without it |
| `escape-time 10` | The 500 ms default swallows `Esc`, which makes vim and readline feel broken over a phone link |
| `status-left`/`status-right` | Which session, and which host — both worth seeing when the client has several tabs open |

### Working in it

The whole point is that you rarely need any of this — you reconnect and your work is where
you left it. What you do need on a phone:

| Do | Keys |
|---|---|
| Leave, keeping everything running | `Ctrl-b d`, or just close the app |
| New window | `Ctrl-b c` |
| Next / previous window | `Ctrl-b n` / `Ctrl-b p` |
| Jump to window *n* | `Ctrl-b <n>` |
| Rename the current window | `Ctrl-b ,` |
| Scroll back | drag, or `Ctrl-b [` then arrows, `q` to leave |
| List sessions | `Ctrl-b s` |

Splitting panes is a laptop pleasure and a phone annoyance — prefer windows on a small
screen. And do not type `exit` in the last shell of the last window: that ends the session
and everything in it. `Ctrl-b d` is the one you want.

To reach a dev container from inside the session, run the launcher as usual; the container
attach then survives the phone disconnecting, because tmux is holding it on the host.

### When the client will not run a startup command

Termius keeps startup commands ("Snippets") behind its paid tier, and other clients bury the
setting or lack it. You do not need it. Force the command from the server instead, on the one
key that phone uses:

```
command="tmux new -A -s main" ssh-ed25519 AAAA… <DEV_USER>-phone
```

Any connection presenting that key now lands in the session regardless of what the client
asks for, and the client needs no configuration at all.

Restrict it to the **phone's** key and leave your workstation key an ordinary shell. That is
your recovery path if tmux ever fails to start, and it costs nothing to keep.

Two consequences worth expecting. `Ctrl-b d` now closes the connection rather than dropping
to a prompt, because the forced command has exited and ssh has nothing left to run — on a
phone that is what you want. And that key can no longer be used for `scp`, since the forced
command replaces whatever was requested; keep a second key if you need to copy files.

The tempting alternative, an `exec tmux` line in `~/.bashrc`, applies to *every* login for
that user rather than to one key, and a mistake in that file locks you out of the account
altogether. Prefer the key restriction.

### The setting that quietly defeats persistence

Before trusting any of this, confirm that logging out does not take the session with it:

```bash
loginctl show-session --property=KillUserProcesses
```

Debian ships `no`, which is what you want — tmux outlives your last logout. Where a system
sets `yes`, every session dies the moment you disconnect, which is precisely the opposite of
the point, and you need `loginctl enable-linger <DEV_USER>` to get the behaviour back. Check
this before debugging anything else about a session that "does not persist".

### The whole sequence, in order

Each step fails in a way that looks like the previous one, so do them in this order:

1. **Tailscale on both** the box and the phone, so there is a route at all.
2. **`30-remote-access.sh`** — installs tmux and `~/.tmux.conf`, writes the keepalive
   drop-in, and checks `KillUserProcesses`.
3. **A key for the phone.** Generate it *on the phone*, in the client's own keychain, and
   authorise only its public half. A key generated elsewhere means moving a private key
   around; a key that already exists on your laptop means losing the phone costs you both.
4. **Confirm the key works** with an ordinary connection, before adding any forced command.
   Debug one thing at a time — a forced command that fails and a key that is not accepted
   look identical from the client.
5. **Then** add `command="tmux new -A -s main"` to that key's line, or set the startup
   command in the client if it has one.
6. **Only now** harden: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`.
   Doing this before step 4 locks out the device you have not finished setting up.

## Script

```bash
scripts/30-remote-access.sh --check    # tailscale? serve? keepalive? tmux? config? KillUserProcesses?
scripts/30-remote-access.sh            # install tmux + ~/.tmux.conf, write the keepalive drop-in
```

It deliberately does not run `tailscale up`, change `PasswordAuthentication`, or write
`authorized_keys`. Each can cut off your own access, and each wants a human who can still
reach a console. An existing `~/.tmux.conf` is backed up rather than overwritten.
