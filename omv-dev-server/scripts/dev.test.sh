#!/usr/bin/env bash
# Runs the launcher against a fake `docker` on PATH, so no daemon is needed.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV="$HERE/dev"

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/bin" "$SANDBOX/repos/owner/repo" "$SANDBOX/home" "$SANDBOX/state"
export FAKE_STATE="$SANDBOX/state"

cat > "$SANDBOX/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_STATE/log"
case "$1 $2" in
  "ps -a")          cat "$FAKE_STATE/existing" ;;
  "ps --format")    cat "$FAKE_STATE/running" ;;
  "image inspect")  [ -s "$FAKE_STATE/image" ] && cat "$FAKE_STATE/image" || exit 1 ;;
  "inspect "*)      cat "$FAKE_STATE/container_image" ;;
  "rm "*)           : > "$FAKE_STATE/existing"; : > "$FAKE_STATE/running" ;;
esac
exit 0
FAKE
chmod +x "$SANDBOX/bin/docker"

NAME=dev_owner_repo
fail=0
total=0
case_name=""
case_failed=0

run_dev() {
  local existing="$1" running="$2" tagged_image="$3" container_image="$4"
  case_name="$5"
  case_failed=0
  total=$((total + 1))
  printf '%s\n' "$existing" > "$FAKE_STATE/existing"
  printf '%s\n' "$running" > "$FAKE_STATE/running"
  printf '%s'   "$tagged_image" > "$FAKE_STATE/image"
  printf '%s\n' "$container_image" > "$FAKE_STATE/container_image"
  : > "$FAKE_STATE/log"
  ( cd "$SANDBOX/repos/owner/repo" && \
    PATH="$SANDBOX/bin:$PATH" DEV_REPO_ROOT="$SANDBOX/repos" DEV_HOME_DIR="$SANDBOX/home" \
    bash "$DEV" > "$FAKE_STATE/out" 2>&1 )
  local status=$?
  cat "$FAKE_STATE/log" "$FAKE_STATE/out" > "$FAKE_STATE/all"
  [ "$status" -eq 0 ] || failed "dev exited $status"
}

failed() {
  echo "FAIL: $case_name -- $1"; cat "$FAKE_STATE/all"
  [ "$case_failed" = 1 ] || fail=$((fail + 1)); case_failed=1
}

expect() {
  local wanted="$1" pattern="$2" found
  if grep -q -- "$pattern" "$FAKE_STATE/all"; then found=present; else found=absent; fi
  [ "$found" = "$wanted" ] || failed "'$pattern' is $found, expected $wanted"
}

run_dev "$NAME" "" sha256:new sha256:old "stopped and stale: recreated"
expect present "^rm $NAME\$"
expect present "recreating"
expect present "^run .*--name $NAME "
expect absent  "^start $NAME\$"

run_dev "$NAME" "$NAME" sha256:new sha256:old "running and stale: warned, left alone, attached"
expect absent  "^rm "
expect present "older than"
expect present "dev --recreate"
expect present "^exec -it"

run_dev "$NAME" "" sha256:new sha256:new "stopped and current: started, not recreated"
expect absent  "^rm "
expect absent  "older than"
expect present "^start $NAME\$"
expect present "^exec -it"

run_dev "$NAME" "" "" sha256:old "image missing: not treated as stale"
expect absent  "^rm "
expect absent  "older than"
expect present "^start $NAME\$"

run_dev "" "" sha256:new "" "no container: created"
expect absent  "^rm "
expect absent  "older than"
expect present "^run .*--name $NAME "

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
