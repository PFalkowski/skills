#!/usr/bin/env bash
# Verify and repair the dev user. Does NOT create the account — do that in the OMV web UI,
# because only UI-created users can later become Samba accounts (see HOST.md).
#
#   ./10-dev-user.sh --check    report only
#   sudo ./10-dev-user.sh       fix shell, seed home from /etc/skel, install key
. "$(dirname "$0")/lib.sh"
load_env

head_ "user $DEV_USER"
if ! getent passwd "$DEV_USER" >/dev/null; then
  bad "$DEV_USER does not exist — create it in the OMV web UI (Users -> Users -> Create),"
  echo "        set shell /bin/bash, tick groups: _ssh, docker, users, then click Apply."
  finish
fi
ok "exists: $(getent passwd "$DEV_USER")"

# --- groups -----------------------------------------------------------------------------
head_ "groups"
# The sshd gate. On Debian 12+ the group is _ssh, with the underscore; looking for "ssh"
# reports absent and misleads you.
gate="$(sshd -T 2>/dev/null | awk '/^allowgroups/{$1="";print}' | tr -d ' ' || true)"
[ -n "$gate" ] && info "sshd allowgroups: $gate"
for g in _ssh docker users; do
  if getent group "$g" >/dev/null; then
    if id -nG "$DEV_USER" | tr ' ' '\n' | grep -qx "$g"; then ok "in group $g"
    else
      [ "$g" = docker ] && warn "docker group membership is root-equivalent — see HOST.md"
      do_ "add $DEV_USER to $g" usermod -aG "$g" "$DEV_USER" || true
    fi
  else
    warn "group $g does not exist on this host"
  fi
done

# --- shell ------------------------------------------------------------------------------
head_ "shell"
sh_now="$(getent passwd "$DEV_USER" | cut -d: -f7)"
if [ "$sh_now" = /bin/bash ]; then ok "shell is /bin/bash"
else
  warn "shell is $sh_now — the OMV UI's shell field does not always apply"
  need_root; do_ "set shell to /bin/bash" usermod -s /bin/bash "$DEV_USER"
fi

# --- home + dotfiles --------------------------------------------------------------------
head_ "home directory"
home_dir="$(getent passwd "$DEV_USER" | cut -d: -f6)"
if [ -d "$home_dir" ]; then ok "$home_dir exists"
else
  warn "$home_dir missing — OMV does not always create it"
  need_root
  do_ "create $home_dir" mkdir -p "$home_dir"
  do_ "chown $home_dir"  chown "$DEV_USER:users" "$home_dir"
  do_ "chmod 750"        chmod 750 "$home_dir"
fi

# mkdir does not copy /etc/skel. Without .profile a login shell never sources .bashrc,
# so ~/bin never reaches PATH and your launcher is "command not found".
for f in .profile .bashrc .bash_logout; do
  if [ -f "$home_dir/$f" ]; then ok "$f present"
  elif [ -f "/etc/skel/$f" ]; then
    need_root
    do_ "install $f from /etc/skel" install -o "$DEV_USER" -g users -m 644 "/etc/skel/$f" "$home_dir/$f"
  else warn "/etc/skel/$f not available"; fi
done

# --- ssh key ----------------------------------------------------------------------------
head_ "ssh key"
if [ -z "${SSH_PUBKEY:-}" ]; then
  info "SSH_PUBKEY empty in setup.env — skipping"
else
  ak="$home_dir/.ssh/authorized_keys"
  if [ -f "$ak" ] && grep -qF "$SSH_PUBKEY" "$ak" 2>/dev/null; then ok "key already authorised"
  else
    need_root
    do_ "create ~/.ssh" install -d -m 700 -o "$DEV_USER" -g users "$home_dir/.ssh"
    if [ "$CHECK_ONLY" = 0 ]; then
      printf '%s\n' "$SSH_PUBKEY" >> "$ak"
      chown "$DEV_USER:users" "$ak"; chmod 600 "$ak"
      ok "key installed"
    else info "would: append key to $ak"; fi
  fi
fi

finish
