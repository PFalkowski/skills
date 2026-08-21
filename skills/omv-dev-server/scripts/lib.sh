#!/usr/bin/env bash
# Shared helpers. Every script sources this, takes --check for a read-only report,
# and is safe to re-run — so the same scripts that build the box also repair it.

# Deliberately NOT `set -e`. These scripts are diagnostics first: a probe that fails
# (`sshd -T` as non-root, `docker inspect` on an absent container, a `grep` that finds
# nothing) must not abort the report and hide every later check. Failure is captured
# explicitly by do_/bad and surfaced by finish, which sets the exit code.
set -uo pipefail

CHECK_ONLY=0
for a in "${@:-}"; do case "$a" in --check|-n|--dry-run) CHECK_ONLY=1 ;; esac; done

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  _g=$'\e[32m'; _r=$'\e[31m'; _y=$'\e[33m'; _d=$'\e[2m'; _z=$'\e[0m'
else _g=""; _r=""; _y=""; _d=""; _z=""; fi

FAILED=0
ok()    { printf '  %sok%s    %s\n'   "$_g" "$_z" "$*"; }
bad()   { printf '  %sFAIL%s  %s\n'   "$_r" "$_z" "$*"; FAILED=$((FAILED+1)); }
warn()  { printf '  %swarn%s  %s\n'   "$_y" "$_z" "$*"; }
info()  { printf '  %s--%s    %s\n'   "$_d" "$_z" "$*"; }
head_() { printf '\n%s\n' "== $* =="; }

# do_ <description> <command...> — runs unless --check, always narrates.
do_() {
  local what="$1"; shift
  if [ "$CHECK_ONLY" = 1 ]; then info "would: $what"; return 0; fi
  if "$@"; then ok "$what"; else bad "$what"; return 1; fi
}

need_root() {
  [ "$(id -u)" = 0 ] || { echo "This step needs root. Re-run with sudo." >&2; exit 2; }
}

# Load setup.env from beside the scripts. Values are yours; the file is gitignored.
load_env() {
  local here; here="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  if [ -f "$here/setup.env" ]; then
    # shellcheck disable=SC1091
    . "$here/setup.env"
  else
    echo "Missing $here/setup.env — copy setup.env.example and fill it in." >&2
    exit 2
  fi
  : "${DEV_USER:?set DEV_USER in setup.env}"
  : "${DATA_DISK:?set DATA_DISK in setup.env (e.g. /srv/dev-disk-by-uuid-XXXX)}"
  DEV_ROOT="${DEV_ROOT:-$DATA_DISK/dev}"
  REPO_ROOT="${REPO_ROOT:-$DEV_ROOT/repos}"
  DEV_HOME_DIR="${DEV_HOME_DIR:-$DEV_ROOT/dev-home}"
  IMAGE="${IMAGE:-dev-ai}"
}

finish() {
  echo
  if [ "$FAILED" -gt 0 ]; then
    printf '%s%d check(s) failed.%s\n' "$_r" "$FAILED" "$_z"; exit 1
  fi
  printf '%sAll checks passed.%s\n' "$_g" "$_z"
}
