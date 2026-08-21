#!/usr/bin/env bash
# Create the dev directories on the DATA disk, owned by DEV_USER, outside any file share,
# and symlink them into the user's home so nobody types a UUID path.
. "$(dirname "$0")/lib.sh"
load_env

head_ "data disk"
if [ -d "$DATA_DISK" ]; then ok "$DATA_DISK exists"
else bad "$DATA_DISK not found — check 'df -hT | grep /srv' and fix DATA_DISK in setup.env"; finish; fi

# Refuse to put dev data on the OS disk: on many OMV boxes it is small or removable, and
# keeping dev data off it means an OS reinstall costs nothing.
if [ "$(stat -c %d /)" = "$(stat -c %d "$DATA_DISK")" ]; then
  warn "$DATA_DISK is on the same filesystem as / — that is the OS disk, not a data disk"
fi

head_ "directories"
# repos/ is group-readable so tooling can traverse it; dev-home is 0700 because it holds
# agent credentials and every per-project memory file on the box.
do_ "create $REPO_ROOT"     mkdir -p "$REPO_ROOT"
do_ "create $DEV_HOME_DIR"  mkdir -p "$DEV_HOME_DIR"
if [ "$CHECK_ONLY" = 0 ]; then
  need_root
  chown -R "$DEV_USER:users" "$DEV_ROOT"
  chmod 755 "$DEV_ROOT" "$REPO_ROOT"
  chmod 700 "$DEV_HOME_DIR"
  ok "ownership $DEV_USER:users, repos 0755, dev-home 0700"
fi

head_ "symlinks in the user's home"
home_dir="$(getent passwd "$DEV_USER" | cut -d: -f6)"
link() {
  local target="$1" link="$2"
  if [ "$(readlink -f "$link" 2>/dev/null)" = "$(readlink -f "$target")" ]; then
    ok "$link -> $target"
  else
    do_ "link $link -> $target" ln -sfn "$target" "$link"
    if [ "$CHECK_ONLY" = 0 ]; then chown -h "$DEV_USER:users" "$link" 2>/dev/null || true; fi
  fi
  return 0
}
link "$REPO_ROOT"    "$home_dir/repos"
link "$DEV_HOME_DIR" "$home_dir/.dev-home"

head_ "not exported over SMB/NFS"
# Git repos carry credentials in .git/config; exporting them makes every embedded token a
# LAN-readable file.
exported=0
if command -v testparm >/dev/null 2>&1; then
  if testparm -s 2>/dev/null | grep -q "path = *$REPO_ROOT"; then
    bad "$REPO_ROOT is exported over Samba — see HOST.md"; exported=1
  fi
fi
grep -qs "^$REPO_ROOT" /etc/exports && { bad "$REPO_ROOT is in /etc/exports"; exported=1; }
[ "$exported" = 0 ] && ok "repos/ is not shared"

head_ "free space"
df -h "$DATA_DISK" | tail -1 | awk '{printf "  --    %s used of %s, %s free\n", $3, $2, $4}'

finish
