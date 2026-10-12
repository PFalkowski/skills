#!/usr/bin/env bash
# Exercises the launcher's stale-image handling against a fake `docker` on PATH. A
# container is a snapshot of the image it was created from, so after a rebuild the
# launcher must recreate a stopped container, leave a running one alone with a warning,
# and touch nothing when the IDs match or the image is missing.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV="$HERE/dev"

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/bin" "$SANDBOX/repos/owner/repo" "$SANDBOX/home" "$SANDBOX/state"
export FAKE_STATE="$SANDBOX/state"

# The daemon's state lives in files so that `rm` is observed by the `ps` calls after it.
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

# run_dev <existing> <running> <image id> <container's image id>
run_dev() {
  printf '%s\n' "$1" > "$FAKE_STATE/existing"
  printf '%s\n' "$2" > "$FAKE_STATE/running"
  printf '%s'   "$3" > "$FAKE_STATE/image"
  printf '%s\n' "$4" > "$FAKE_STATE/container_image"
  : > "$FAKE_STATE/log"
  ( cd "$SANDBOX/repos/owner/repo" && \
    PATH="$SANDBOX/bin:$PATH" DEV_REPO_ROOT="$SANDBOX/repos" DEV_HOME_DIR="$SANDBOX/home" \
    bash "$DEV" > "$FAKE_STATE/out" 2>&1 )
}

# check <desc> <exit status> <pattern>...   A leading '!' means the pattern must be absent.
# Patterns are matched against the docker calls and the launcher's output together.
check() {
  local desc="$1" status="$2"; shift 2
  total=$((total + 1))
  cat "$FAKE_STATE/log" "$FAKE_STATE/out" > "$FAKE_STATE/all"
  if [ "$status" -ne 0 ]; then
    echo "FAIL: $desc -- dev exited $status"; cat "$FAKE_STATE/all"; fail=$((fail + 1)); return
  fi
  local pattern want_present found
  for pattern in "$@"; do
    want_present=1
    case "$pattern" in '!'*) want_present=0; pattern="${pattern#!}" ;; esac
    found=0; grep -q -- "$pattern" "$FAKE_STATE/all" && found=1
    if [ "$found" -ne "$want_present" ]; then
      echo "FAIL: $desc -- pattern '$pattern' present=$found, wanted $want_present"
      cat "$FAKE_STATE/all"; fail=$((fail + 1))
    fi
  done
}

run_dev "$NAME" "" sha256:new sha256:old; status=$?
check "stopped and stale: recreated" "$status" \
  "^rm $NAME\$" "recreating" "^run .*--name $NAME " "!^start $NAME\$"

run_dev "$NAME" "$NAME" sha256:new sha256:old; status=$?
check "running and stale: warned, left alone, attached" "$status" \
  "!^rm " "older than" "dev --recreate" "^exec -it"

run_dev "$NAME" "" sha256:new sha256:new; status=$?
check "stopped and current: started, not recreated" "$status" \
  "!^rm " "!older than" "^start $NAME\$" "^exec -it"

run_dev "$NAME" "" "" sha256:old; status=$?
check "image missing: not treated as stale" "$status" \
  "!^rm " "!older than" "^start $NAME\$"

run_dev "" "" sha256:new ""; status=$?
check "no container: created" "$status" \
  "!^rm " "!older than" "^run .*--name $NAME "

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
