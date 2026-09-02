#!/usr/bin/env bash
# Tailscale, SSH keepalives, tmux.
#
# Deliberately does NOT run `tailscale up`, and does NOT turn off password authentication.
# Both can cut off your own access to a headless box and want a human who can reach a
# console. This reports on them and prints the command.
. "$(dirname "$0")/lib.sh"
load_env

head_ "tailscale"
if ! command -v tailscale >/dev/null; then
  bad "not installed"
  info "install: curl -fsSL https://tailscale.com/install.sh | sh   then: tailscale up"
else
  ok "$(tailscale version 2>/dev/null | head -1)"
  if tailscale status >/dev/null 2>&1; then
    ok "up: $(tailscale status --json 2>/dev/null | grep -o '"HostName":"[^"]*"' | head -1 | cut -d'"' -f4)"
  else
    warn "installed but not connected — run: tailscale up"
  fi

  head_ "tailscale serve (HTTPS for a local port, tailnet-only)"
  if tailscale serve status 2>/dev/null | grep -q "proxy http"; then
    tailscale serve status 2>/dev/null | sed 's/^/  --    /'
  else
    warn "nothing served"
    info "to publish the local service on a real HTTPS name, tailnet-only:"
    info "  tailscale serve --bg ${SERVE_PORT:-2283}"
    info "do NOT serve a service that has no authentication of its own"
  fi
fi

head_ "ssh keepalive"
# Debian defaults to ClientAliveInterval 0 — no keepalive — so a mobile session behind
# carrier NAT dies silently when the mapping expires.
# `sshd -T` needs root; as an ordinary user it fails and we simply cannot tell.
iv="$(sshd -T 2>/dev/null | awk '/^clientaliveinterval/{print $2}' || true)"
if [ -z "$iv" ]; then
  info "cannot read sshd config as $(id -un) — re-run this step with sudo to check keepalive"
elif [ "$iv" -gt 0 ] 2>/dev/null; then
  ok "ClientAliveInterval=$iv"
else
  warn "ClientAliveInterval=0 — mobile sessions will drop when idle"
  conf=/etc/ssh/sshd_config.d/10-keepalive.conf
  if [ "$CHECK_ONLY" = 0 ]; then
    need_root
    printf 'ClientAliveInterval 60\nClientAliveCountMax 5\n' > "$conf"
    if sshd -t; then
      systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
      ok "wrote $conf and reloaded sshd"
    else
      rm -f "$conf"; bad "sshd config test failed; reverted"
    fi
  else info "would: write $conf (ClientAliveInterval 60 / CountMax 5)"; fi
fi

head_ "sshd exposure (report only)"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|allowgroups)' \
  | sed 's/^/  --    /' || info "needs root to read"
info "once key auth works from every device, consider:"
info "  PasswordAuthentication no ; PermitRootLogin prohibit-password"
info "verify key login FIRST and keep a second session open while reloading sshd"

head_ "tmux"
if command -v tmux >/dev/null; then ok "$(tmux -V)"
else
  do_ "install tmux" sh -c 'apt-get update -qq && apt-get install -y -qq tmux' || true
fi

# A session that dies on logout is not persistent, and this is the setting that decides it.
# Check it before anything else: everything below is pointless if it says yes.
kup="$(loginctl show-session --property=KillUserProcesses 2>/dev/null | cut -d= -f2)"
case "$kup" in
  no|"") ok "KillUserProcesses=${kup:-no} — sessions survive logout" ;;
  yes)   bad "KillUserProcesses=yes — tmux dies at logout. Fix: loginctl enable-linger $DEV_USER" ;;
esac

home_dir="$(getent passwd "$DEV_USER" | cut -d: -f6)"
src="$(dirname "$0")/tmux.conf"
dst="$home_dir/.tmux.conf"
if [ ! -f "$src" ]; then
  warn "$src missing — skipping tmux config"
elif cmp -s "$src" "$dst" 2>/dev/null; then
  ok "$dst already current"
else
  # Never clobber a config someone tuned themselves; keep a dated copy first.
  [ -f "$dst" ] && do_ "back up existing $dst" cp -a "$dst" "$dst.bak-$(date +%Y%m%d-%H%M%S)"
  do_ "install $dst" install -o "$DEV_USER" -g users -m 644 "$src" "$dst"
fi

info "durable mobile shell — attach or create in one idempotent command:"
info "  tmux new -A -s main      (plain 'new -s' fails on the second connection)"
info "if your client has no startup-command field, force it on that key instead:"
info "  command=\"tmux new -A -s main\" ssh-ed25519 AAAA... ${DEV_USER}-phone"
info "  put it in ~/.ssh/authorized_keys — OMV's UI field validates a bare key only"

finish
