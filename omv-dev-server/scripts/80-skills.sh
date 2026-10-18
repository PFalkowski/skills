#!/usr/bin/env bash
# Skills for the dev containers' Claude, from a clone that tracks main and refreshes itself
# at every session start. See skills-sync.sh for why not a working checkout.
. "$(dirname "$0")/lib.sh"
load_env
here="$(cd "$(dirname "$0")" && pwd)"
SKILLS_REPO="${SKILLS_REPO:-https://github.com/PFalkowski/skills}"
gid="$(id -g "$DEV_USER")"; uid="$(id -u "$DEV_USER")"
clone="$DEV_HOME_DIR/.local/share/skills"
settings="$DEV_HOME_DIR/.claude/settings.json"
# Paths as the container sees them: HOME there is /dev-home.
sync_in_ctr='$HOME/.local/share/skills/omv-dev-server/scripts/skills-sync.sh'
# Backgrounded so a slow network never delays a session; guarded so a clone from before
# this script existed is a no-op rather than a hook error on every start.
# if/fi, not &&: a false guard would exit 1, which Claude Code reports as a hook error.
hook="if [ -x $sync_in_ctr ]; then ($sync_in_ctr >/dev/null 2>&1 &); fi"

as_user() { if [ "$(id -u)" = "$uid" ]; then "$@"; else sudo -u "$DEV_USER" "$@"; fi; }

head_ "clone of $SKILLS_REPO"
if [ -d "$clone/.git" ]; then
  ok "$clone ($(git -C "$clone" rev-parse --abbrev-ref HEAD) @ $(git -C "$clone" log -1 --format=%h))"
else
  do_ "clone into $clone" as_user git clone -q "$SKILLS_REPO" "$clone"
fi

head_ "links in $DEV_HOME_DIR/.claude/skills"
ctr="$(docker ps --format '{{.Names}}' 2>/dev/null | grep '^dev_' | head -1)"
if [ -z "$ctr" ]; then
  warn "no dev container running — start one with 'dev', then re-run this step"
elif [ "$CHECK_ONLY" = 1 ]; then
  info "would: sync via $ctr"
else
  # Run from this checkout, not the clone: on first install the clone's main may predate it.
  # In the container, so links get the paths the container resolves.
  do_ "sync via $ctr" docker exec -i --user "$uid:$gid" -e HOME=/dev-home "$ctr" bash -s < "$here/skills-sync.sh"
fi

head_ "SessionStart hook in $settings"
if ! command -v jq >/dev/null; then
  bad "jq not on the host — sudo apt install jq"
elif jq -e --arg h "$hook" '[.hooks.SessionStart[]?.hooks[]?.command] | index($h)' "$settings" >/dev/null 2>&1; then
  ok "installed"
elif [ "$CHECK_ONLY" = 1 ]; then
  info "would: add $hook"
else
  backup="$settings.bak-$(date +%Y%m%d-%H%M%S)"
  do_ "back up settings" cp -a "$settings" "$backup"
  tmp="$(mktemp)"
  if jq --arg h "$hook" '.hooks.SessionStart += [{"hooks": [{"type": "command", "command": $h}]}]' \
       "$backup" > "$tmp"; then
    do_ "add hook" install -o "$DEV_USER" -g "$gid" -m 644 "$tmp" "$settings"
  else
    bad "settings.json is not valid JSON — left untouched"
  fi
  rm -f "$tmp"
fi

info "restart container Claude sessions to load the re-pointed skills"
finish
