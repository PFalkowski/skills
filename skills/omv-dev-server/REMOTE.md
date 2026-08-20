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
- Set `set -g mouse on` in `~/.tmux.conf` — pane selection and scrollback by touch are the
  difference between usable and not.
- `Ctrl-b` is awkward on a phone keyboard. Termius has a configurable key bar; add
  `Ctrl`, `Tab`, `Esc` and the arrows to it rather than rebinding the prefix, so your muscle
  memory stays the same on a laptop.
- Long agent runs belong in tmux **on the host**, not in a container's foreground — see the
  attach trap in [PITFALLS.md](PITFALLS.md).

## Script

```bash
scripts/30-remote-access.sh --check    # tailscale up? serve configured? keepalive set? tmux present?
scripts/30-remote-access.sh            # install tmux, write the keepalive drop-in, print the serve command
```

It deliberately does not run `tailscale up` or change `PasswordAuthentication` for you.
Both can cut off your own access, and both want a human who can reach a console.
