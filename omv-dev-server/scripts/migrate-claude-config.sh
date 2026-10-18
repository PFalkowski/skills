#!/usr/bin/env bash
#
# migrate-claude-config — move existing dev containers onto their own Claude Code config
# folder, then prove the move worked. Run on the host as the dev user, after installing a
# `dev` that seeds ~/.dev-home/.claude-containers/ (DEVCONTAINER.md explains why).
#
#   migrate-claude-config.sh recreate   recreate every idle dev_* container that is still on the
#                                       shared folder or has the wrong auto-update setting;
#                                       recreated containers are left running
#   migrate-claude-config.sh check      every running container: own folder, links resolve,
#                                       logged in; only dev_$DEV_CLAUDE_UPDATER auto-updates
#   migrate-claude-config.sh race A B   start a background session in containers A and B, touch
#                                       the shared binary, and confirm both sessions survive
#
# Exits non-zero when anything was skipped or failed, so it can be re-run until it is quiet.
set -euo pipefail

REPO_ROOT="${DEV_REPO_ROOT:-$HOME/repos}"
DEV_HOME="${DEV_HOME_DIR:-$HOME/.dev-home}"
DEV="${DEV_LAUNCHER:-dev}"
UPDATER="dev_$(printf '%s' "${DEV_CLAUDE_UPDATER:-workspace}" | tr -c 'a-zA-Z0-9_.-' '_')"
SHARED_ITEMS="CLAUDE.md settings.json settings.local.json skills projects"
problems=0

problem() { echo "✋ $*"; problems=$((problems + 1)); }

containers() { docker ps -a --format '{{.Names}}' | grep '^dev_' || true; }
running()    { docker ps --format '{{.Names}}' | grep -qx "$1"; }
env_of()     { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1"; }
config_dir_of() { env_of "$1" | sed -n 's/^CLAUDE_CONFIG_DIR=//p'; }
workdir_of() { docker inspect -f '{{.Config.WorkingDir}}' "$1"; }
auto_updates() { ! env_of "$1" | grep -qx 'DISABLE_AUTOUPDATER=1'; }
# A login shell, so the home's .profile puts the self-updated claude on PATH.
in_container() {
  local name="$1"; shift
  docker exec --user "$(id -u):$(id -g)" -w "$(workdir_of "$name")" "$name" bash -lc "$*"
}

migrated() {
  local name="$1"
  [ -n "$(config_dir_of "$name")" ] || return 1
  if [ "$name" = "$UPDATER" ]; then auto_updates "$name"; else ! auto_updates "$name"; fi
}

recreate() {
  local name workdir host_dir processes
  for name in $(containers); do
    if migrated "$name"; then
      echo "✅ $name already has its own config folder"; continue
    fi
    # Captured first: `grep -q` stopping early could kill `docker top` under pipefail and
    # make a busy container look idle. Recreating destroys every session inside it.
    processes="$(docker top "$name" 2>/dev/null || true)"
    if grep -q claude <<<"$processes"; then
      problem "$name: claude is running in it. Close its sessions, then re-run."; continue
    fi
    workdir="$(workdir_of "$name")"
    host_dir="$REPO_ROOT${workdir#/workspace}"
    if [ ! -d "$host_dir" ]; then
      problem "$name: its working directory $host_dir is not on the host. Remove it with: docker rm $name"
      continue
    fi
    echo "♻️  $name"
    ( cd "$host_dir" && "$DEV" --recreate --detach --name "${name#dev_}" ) || problem "$name: dev failed"
  done
}

check() {
  local name dir line out before updaters="" seen=" "
  for name in $(containers); do
    if ! running "$name"; then echo "⏸️  $name is stopped; not checked"; continue; fi
    dir="$(config_dir_of "$name")"
    if [ -z "$dir" ]; then problem "$name still uses the shared /dev-home/.claude"; continue; fi
    before=$problems
    case "$seen" in *" $dir "*) problem "$name shares $dir with another container" ;; esac
    seen="$seen$dir "
    if auto_updates "$name"; then updaters="$updaters $name"; fi
    # shellcheck disable=SC2016  # expanded inside the container
    out="$(in_container "$name" '
      for item in '"$SHARED_ITEMS"'; do
        if [ -e "/dev-home/.claude/$item" ] && [ ! -e "$CLAUDE_CONFIG_DIR/$item" ]; then
          echo "missing $item"
        fi
      done
      claude auth status >/dev/null 2>&1 || echo "not logged in"
      echo ok
    ' 2>&1)" || true
    # A failed exec prints an error instead of the closing "ok", so it cannot pass silently.
    [ "$(tail -n 1 <<<"$out")" = ok ] || problem "$name: the in-container check did not finish"
    while read -r line; do
      [ "$line" = ok ] || [ -z "$line" ] || problem "$name: $line"
    done <<<"$out"
    if [ "$problems" = "$before" ]; then echo "✅ $name: $dir"; fi
  done
  if [ "$updaters" != " $UPDATER" ]; then
    problem "auto-update should be on in $UPDATER only; it is on in:${updaters:- none}"
  else
    echo "✅ auto-update on in $UPDATER only"
  fi
}

# Every background session's "id state", run inside the container where node is installed.
jobs_of() {
  in_container "$1" 'claude agents --json --all | node -e '"'"'
    for (const j of JSON.parse(require("fs").readFileSync(0, "utf8")))
      if (j.kind === "background") console.log(j.id + " " + j.state);'"'"
}

# shellcheck disable=SC2016  # expanded inside the container
daemon_pid_alive() {
  in_container "$1" '
    pid="$(grep -o "\"pid\": *[0-9]*" "$CLAUDE_CONFIG_DIR/daemon.lock" 2>/dev/null | head -1 | grep -o "[0-9]*$")"
    [ -n "$pid" ] && [ -d "/proc/$pid" ] && echo "$pid"'
}

declare -A JOB=()
stop_started_jobs() {
  local name
  for name in "${!JOB[@]}"; do in_container "$name" "claude stop ${JOB[$name]}" >/dev/null 2>&1 || true; done
}

# A session counts as alive while it is in none of these states.
ENDED='^(done|completed|failed|killed|stopped|error|missing)$'

race() {
  local a="${1:?race needs two container names}" b="${2:?race needs two container names}"
  local name other binary prompt pid log before state
  local -A lines state_before
  for name in "$a" "$b"; do
    running "$name" || { problem "$name is not running"; return; }
    [ -n "$(config_dir_of "$name")" ] || { problem "$name still uses the shared folder; recreate it first"; return; }
  done
  trap stop_started_jobs EXIT

  prompt='Run the shell command `sleep 240`, then reply with the single word done.'
  for name in "$a" "$b"; do
    before="$(jobs_of "$name" | cut -d' ' -f1)"
    in_container "$name" "claude --bg --model haiku --allowedTools 'Bash(sleep *)' $(printf '%q' "$prompt")" >/dev/null
    sleep 10
    # The new session is the one id that was not there before.
    JOB[$name]="$(jobs_of "$name" | cut -d' ' -f1 | grep -vxF -f <(printf '%s\n' "$before") | head -1 || true)"
    [ -n "${JOB[$name]}" ] || { problem "$name: the background session did not start"; return; }
    echo "▶️  $name: background session ${JOB[$name]}"
  done
  sleep 15

  for name in "$a" "$b"; do
    if pid="$(daemon_pid_alive "$name")"; then echo "✅ $name: daemon.lock names pid $pid, alive in $name"
    else problem "$name: daemon.lock names no live process in $name"; fi
    state_before[$name]="$(jobs_of "$name" | awk -v id="${JOB[$name]}" '$1 == id { print $2 }')"
    if grep -Eq "$ENDED" <<<"${state_before[$name]:-missing}"; then
      problem "$name: session ${JOB[$name]} is ${state_before[$name]:-missing} before the touch, so the race proves nothing"
      return
    fi
    # shellcheck disable=SC2016  # expanded inside the container
    lines[$name]="$(in_container "$name" 'wc -l < "$CLAUDE_CONFIG_DIR/daemon.log"')"
  done

  binary="$(in_container "$a" 'readlink -f "$(command -v claude)"')"
  case "$binary" in
    /dev-home/*) binary="$DEV_HOME${binary#/dev-home}" ;;
    *) problem "claude in $a is $binary, the image's copy rather than the shared self-updated one; nothing shared to touch"
       return ;;
  esac
  echo "👆 touching $binary"
  touch "$binary"
  sleep 60

  for name in "$a" "$b"; do
    other="$a"; [ "$name" = "$a" ] && other="$b"
    log="$(in_container "$name" "tail -n +$((lines[$name] + 1)) \"\$CLAUDE_CONFIG_DIR/daemon.log\"")"
    grep -q 'self-restarting' <<<"$log" || problem "$name: its daemon did not restart, so the touch proved nothing"
    if grep -q 'dead=[1-9]' <<<"$log"; then problem "$name: daemon log reports dead sessions"; fi
    if grep -qF "${JOB[$other]}" <<<"$log"; then problem "$name: daemon log mentions $other's session ${JOB[$other]}"; fi
    state="$(jobs_of "$name" | awk -v id="${JOB[$name]}" '$1 == id { print $2 }')"
    if grep -Eq "$ENDED" <<<"${state:-missing}"; then
      problem "$name: session ${JOB[$name]} was ${state_before[$name]} and is now ${state:-missing}"
    else
      echo "✅ $name: session ${JOB[$name]} is still ${state} after the restart"
    fi
  done
}

case "${1:-}" in
  recreate) recreate ;;
  check)    check ;;
  race)     shift; race "$@" ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac

if [ "$problems" -gt 0 ]; then echo "$problems problem(s)"; exit 1; fi
echo "no problems"
