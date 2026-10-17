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
  "container inspect") [ -s "$FAKE_STATE/container_image" ] && cat "$FAKE_STATE/container_image" || exit 1 ;;
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
  printf '%s'   "$container_image" > "$FAKE_STATE/container_image"
  : > "$FAKE_STATE/log"
  ( cd "$SANDBOX/repos/owner/repo" && \
    PATH="$SANDBOX/bin:$PATH" DEV_REPO_ROOT="$SANDBOX/repos" DEV_HOME_DIR="$SANDBOX/home" \
    bash "$DEV" ${DEV_ARGS:-} > "$FAKE_STATE/out" 2>&1 )
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

expect_file() {
  local test_flag="$1" path="$2"
  test "$test_flag" "$path" || failed "test $test_flag $path is false"
}

SHARED="$SANDBOX/home/.claude"
OWN="$SANDBOX/home/.claude-containers/$NAME"
mkdir -p "$SHARED/skills/some-skill" "$SHARED/projects"
echo '{"user":"wide"}' > "$SHARED/settings.json"
echo 'shared instructions' > "$SHARED/CLAUDE.md"
echo 'secret' > "$SHARED/.credentials.json"
echo '{"projects":{}}' > "$SANDBOX/home/.claude.json"

run_dev "$NAME" "$NAME" sha256:new sha256:new "running and current: attached, nothing seeded"
expect present "^exec -it"
[ ! -e "$OWN" ] || failed "$OWN was created for a container that does not use it"

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

run_dev "$NAME" "" sha256:new "" "container inspect fails: not treated as stale"
expect absent  "^rm "
expect absent  "older than"
expect present "^start $NAME\$"

run_dev "" "" sha256:new "" "no container: created"
expect absent  "^rm "
expect absent  "older than"
expect present "^run .*--name $NAME "
expect present "^run .* -e CLAUDE_CONFIG_DIR=/dev-home/.claude-containers/$NAME "
expect present "^run .* -e CLAUDE_SECURESTORAGE_CONFIG_DIR=/dev-home/.claude "
expect present "^run .* -e DISABLE_AUTOUPDATER=1 "
for item in settings.json CLAUDE.md skills projects; do
  expect_file -L "$OWN/$item"
  [ "$(readlink "$OWN/$item")" = "../../.claude/$item" ] || failed "$item link is not relative: $(readlink "$OWN/$item")"
done
[ "$(cat "$OWN/settings.json")" = '{"user":"wide"}' ] || failed "settings.json link does not reach the shared copy"
expect_file -d "$OWN/skills/some-skill"
expect_file -f "$OWN/.claude.json"
[ ! -L "$OWN/.claude.json" ] || failed ".claude.json is a link, not a copy"
[ ! -e "$OWN/.credentials.json" ] || failed ".credentials.json was placed in the per-container folder"
[ ! -e "$OWN/settings.local.json" ] && [ ! -L "$OWN/settings.local.json" ] \
  || failed "settings.local.json was linked although the shared one does not exist"

echo '{"projects":{"edited":true}}' > "$OWN/.claude.json"
rm "$OWN/settings.json"; echo 'own' > "$OWN/settings.json"
echo '{}' > "$SHARED/settings.local.json"
ln -s ../../.claude/gone "$OWN/settings.local.json"
run_dev "" "" sha256:new "" "created again: nothing seeded is overwritten, a dangling link is tolerated"
expect present "^run .*--name $NAME "
[ "$(cat "$OWN/.claude.json")" = '{"projects":{"edited":true}}' ] || failed ".claude.json was overwritten"
[ "$(cat "$OWN/settings.json")" = 'own' ] || failed "settings.json was overwritten"
[ "$(readlink "$OWN/settings.local.json")" = ../../.claude/gone ] || failed "the dangling link was replaced"
rm "$OWN/settings.local.json" "$SHARED/settings.local.json"

DEV_ARGS="--name workspace" run_dev "" "" sha256:new "" "the default updater container keeps auto-update"
expect present "^run .*--name dev_workspace "
expect absent  "DISABLE_AUTOUPDATER"
expect_file -L "$SANDBOX/home/.claude-containers/dev_workspace/settings.json"

DEV_ARGS="--name o/r" DEV_CLAUDE_UPDATER="o/r" run_dev "" "" sha256:new "" "an updater name is sanitised like a container name"
expect present "^run .*--name dev_o_r "
expect absent  "DISABLE_AUTOUPDATER"

rm -rf "$SANDBOX/home"; mkdir -p "$SANDBOX/home"
run_dev "" "" sha256:new "" "fresh home: projects and skills are linked even before they exist"
expect_file -L "$SANDBOX/home/.claude-containers/$NAME/projects"
expect_file -L "$SANDBOX/home/.claude-containers/$NAME/skills"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
