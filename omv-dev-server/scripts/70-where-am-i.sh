#!/usr/bin/env bash
# Make every shell prompt and every Claude Code status line say where it runs: the host, or
# which dev container. The two sides keep separate Claude session lists, and nothing else
# on screen tells them apart.
. "$(dirname "$0")/lib.sh"
load_env
here="$(cd "$(dirname "$0")" && pwd)"
statusline="$here/../../statusline/scripts"
home_dir="$(getent passwd "$DEV_USER" | cut -d: -f6)"
uid="$(id -u "$DEV_USER")"; gid="$(id -g "$DEV_USER")"
rc_line='[ -f ~/.local/share/omv-dev/where.bash ] && . ~/.local/share/omv-dev/where.bash'

as_user() { if [ "$(id -u)" = "$uid" ]; then "$@"; else sudo -u "$DEV_USER" "$@"; fi; }

# The same relative path on both sides, so one source line serves the host's ~/.bashrc and
# the containers' (whose HOME is the dev-home directory).
install_prompt() {
  local home="$1"
  local dst="$home/.local/share/omv-dev/where.bash"
  if cmp -s "$here/where.bash" "$dst"; then ok "$dst current"
  else do_ "install $dst" install -D -o "$DEV_USER" -g "$gid" -m 644 "$here/where.bash" "$dst"; fi
  if grep -qxF "$rc_line" "$home/.bashrc" 2>/dev/null; then ok "$home/.bashrc sources it"
  else do_ "source it from $home/.bashrc" as_user sh -c 'printf "\n%s\n" "$1" >> "$2"' _ "$rc_line" "$home/.bashrc"; fi
}

head_ "prompt: host"
install_prompt "$home_dir"

head_ "prompt: dev containers"
install_prompt "$DEV_HOME_DIR"

if [ ! -f "$statusline/install.mjs" ]; then
  bad "statusline skill not found beside this one ($statusline)"
  finish
fi

head_ "status line: host (tagged ⚠️ HOST)"
if command -v node >/dev/null; then
  if [ "$CHECK_ONLY" = 1 ]; then as_user node "$statusline/install.mjs" --host-warning --dry-run | sed 's/^/  --    /'
  else do_ "install host status line" as_user env CLAUDE_CONFIG_DIR="$home_dir/.claude" node "$statusline/install.mjs" --host-warning; fi
else
  # The host Claude is a native binary and brings no node; the status line needs one.
  bad "node not on the host — sudo apt install nodejs   (then re-run this step)"
fi

head_ "status line: dev containers (tagged 🐳 <container>)"
# Installed from inside a container, so settings.json gets the path the container sees.
ctr="$(docker ps --format '{{.Names}}' 2>/dev/null | grep '^dev_' | head -1)"
staged="$DEV_HOME_DIR/.local/share/omv-dev/statusline"
if [ -z "$ctr" ]; then
  warn "no dev container running — start one with 'dev', then re-run this step"
elif [ "$CHECK_ONLY" = 1 ]; then
  info "would: install via $ctr"
else
  do_ "stage status line in $staged" install -D -o "$DEV_USER" -g "$gid" -m 644 \
      -t "$staged" "$statusline/statusline.js" "$statusline/install.mjs"
  do_ "install container status line via $ctr" docker exec --user "$uid:$gid" -e HOME=/dev-home "$ctr" \
      node /dev-home/.local/share/omv-dev/statusline/install.mjs
fi

info "open a new shell (or: . ~/.bashrc) for the prompt; restart Claude sessions for the status line"
finish
