#!/usr/bin/env bash
#
# migrate-claude-config — move existing dev containers onto their own Claude Code config
# folder, then prove the move worked. Run on the host as the dev user, after installing a
# `dev` that seeds ~/.dev-home/.claude-containers/ (DEVCONTAINER.md explains why).
#
#   migrate-claude-config.sh recreate   recreate every idle dev_* container still on the shared folder
#   migrate-claude-config.sh check      every running container: own folder, links resolve,
#                                       logged in; exactly one container auto-updates
#   migrate-claude-config.sh race A B   start a background session in containers A and B, touch
#                                       the shared binary, and confirm both sessions survive
#
# Exits non-zero when anything was skipped or failed, so it can be re-run until it is quiet.
set -euo pipefail

REPO_ROOT="${DEV_REPO_ROOT:-$HOME/repos}"
DEV_HOME="${DEV_HOME_DIR:-$HOME/.dev-home}"
DEV="${DEV_LAUNCHER:-dev}"
SHARED_ITEMS="CLAUDE.md settings.json settings.local.json skills projects"
problems=0

problem() { echo "✋ $*"; problems=$((problems + 1)); }

containers() { docker ps -a --format '{{.Names}}' | grep '^dev_' || true; }
running()    { docker ps --format '{{.Names}}' | grep -qx "$1"; }
env_of()     { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1"; }
config_dir_of() { env_of "$1" | sed -n 's/^CLAUDE_CONFIG_DIR=//p'; }
workdir_of() { docker inspect -f '{{.Config.WorkingDir}}' "$1"; }
# A login shell, so the home's .profile puts the self-updated claude on PATH.
in_container() {
  local name="$1"; shift
  docker exec --user "$(id -u):$(id -g)" -w "$(workdir_of "$name")" "$name" bash -lc "$*"
}

recreate() {
  local name workdir host_dir
  for name in $(containers); do
    if [ -n "$(config_dir_of "$name")" ]; then
      echo "✅ $name already has its own config folder"; continue
    fi
    # Recreating destroys the container and every session inside it.
    if docker top "$name" 2>/dev/null | grep -q claude; then
      problem "$name: claude is running in it. Close its sessions, then re-run."; continue
    fi
    workdir="$(workdir_of "$name")"
    host_dir="$REPO_ROOT${workdir#/workspace}"
    if [ ! -d "$host_dir" ]; then
      problem "$name: its working directory $host_dir is not on the host"; continue
    fi
    echo "♻️  $name"
    ( cd "$host_dir" && "$DEV" --recreate --detach --name "${name#dev_}" ) || problem "$name: dev failed"
  done
}

check() {
  local name dir line updaters="" seen=" "
  for name in $(containers); do
    if ! running "$name"; then echo "⏸️  $name is stopped; not checked"; continue; fi
    dir="$(config_dir_of "$name")"
    if [ -z "$dir" ]; then problem "$name still uses the shared /dev-home/.claude"; continue; fi
    case "$seen" in *" $dir "*) problem "$name shares $dir with another container" ;; esac
    seen="$seen$dir "
    env_of "$name" | grep -qx 'DISABLE_AUTOUPDATER=1' || updaters="$updaters $name"
    # shellcheck disable=SC2016  # expanded inside the container
    while read -r line; do problem "$name: $line"; done < <(in_container "$name" '
      for item in '"$SHARED_ITEMS"'; do
        if [ -e "/dev-home/.claude/$item" ] && [ ! -e "$CLAUDE_CONFIG_DIR/$item" ]; then
          echo "missing $item"
        fi
      done
      claude auth status >/dev/null 2>&1 || echo "not logged in"
    ')
    echo "✅ $name: $dir"
  done
  case "$(wc -w <<<"$updaters")" in
    1) echo "✅ auto-update on in:$updaters only" ;;
    0) problem "no running container auto-updates Claude Code" ;;
    *) problem "several containers auto-update Claude Code:$updaters" ;;
  esac
}

# The newest background session's id, as `claude agents` reports it.
newest_job() {
  in_container "$1" 'claude agents --json --all' | node -e '
    const jobs = JSON.parse(require("fs").readFileSync(0, "utf8")).filter(j => j.kind === "background");
    jobs.sort((a, b) => b.startedAt - a.startedAt);
    console.log(jobs.length ? jobs[0].id : "");'
}

job_state() {
  in_container "$1" 'claude agents --json --all' | node -e '
    const job = JSON.parse(require("fs").readFileSync(0, "utf8")).find(j => j.id === process.argv[1]);
    console.log(job ? job.state : "missing");' "$2"
}

# shellcheck disable=SC2016  # expanded inside the container
daemon_pid_alive() {
  in_container "$1" '
    pid="$(grep -o "\"pid\": *[0-9]*" "$CLAUDE_CONFIG_DIR/daemon.lock" 2>/dev/null | head -1 | grep -o "[0-9]*$")"
    [ -n "$pid" ] && [ -d "/proc/$pid" ] && echo "$pid"'
}

race() {
  local a="${1:?race needs two container names}" b="${2:?race needs two container names}"
  local name other binary prompt pid log state
  local -A job lines
  for name in "$a" "$b"; do
    running "$name" || { problem "$name is not running"; return; }
    [ -n "$(config_dir_of "$name")" ] || { problem "$name still uses the shared folder; recreate it first"; return; }
  done

  prompt='Run the shell command `sleep 240`, then reply with the single word done.'
  for name in "$a" "$b"; do
    in_container "$name" "claude --bg --model haiku --allowedTools 'Bash(sleep *)' $(printf '%q' "$prompt")" >/dev/null
    sleep 5
    job[$name]="$(newest_job "$name")"
    [ -n "${job[$name]}" ] || { problem "$name: the background session did not start"; return; }
    echo "▶️  $name: background session ${job[$name]}"
  done
  sleep 20

  for name in "$a" "$b"; do
    if pid="$(daemon_pid_alive "$name")"; then echo "✅ $name: daemon.lock names pid $pid, alive in $name"
    else problem "$name: daemon.lock names no live process in $name"; fi
    # shellcheck disable=SC2016  # expanded inside the container
    lines[$name]="$(in_container "$name" 'wc -l < "$CLAUDE_CONFIG_DIR/daemon.log"')"
  done

  binary="$(in_container "$a" 'readlink -f "$(command -v claude)"')"
  binary="${binary/#\/dev-home/$DEV_HOME}"
  echo "👆 touching $binary"
  touch "$binary"
  sleep 60

  for name in "$a" "$b"; do
    other="$a"; [ "$name" = "$a" ] && other="$b"
    log="$(in_container "$name" "tail -n +$((lines[$name] + 1)) \"\$CLAUDE_CONFIG_DIR/daemon.log\"")"
    grep -q 'self-restarting' <<<"$log" || problem "$name: its daemon did not restart, so the touch proved nothing"
    if grep -q 'dead=[1-9]' <<<"$log"; then problem "$name: daemon log reports dead sessions"; fi
    if grep -q "${job[$other]}" <<<"$log"; then problem "$name: daemon log mentions $other's session ${job[$other]}"; fi
    state="$(job_state "$name" "${job[$name]}")"
    case "$state" in
      failed|killed|missing) problem "$name: session ${job[$name]} is $state" ;;
      *) echo "✅ $name: session ${job[$name]} is $state after the restart" ;;
    esac
    in_container "$name" "claude stop ${job[$name]}" >/dev/null 2>&1 || true
  done
}

case "${1:-}" in
  recreate) recreate ;;
  check)    check ;;
  race)     shift; race "$@" ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac

if [ "$problems" -gt 0 ]; then echo "$problems problem(s)"; exit 1; fi
echo "no problems"
