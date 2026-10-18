#!/usr/bin/env bash
# Runs `migrate-claude-config.sh recreate` and `check` against a fake `docker` and a fake `dev`.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/bin"
for repo in idle busy done stray workspace; do mkdir -p "$SANDBOX/repos/owner/$repo"; done
export FAKE_LOG="$SANDBOX/log"
touch "$FAKE_LOG"

# dev_idle:      on the shared folder, nothing running             -> recreated
# dev_busy:      on the shared folder, claude running              -> skipped
# dev_done:      own folder, auto-update off                       -> left alone
# dev_stray:     own folder, but auto-updates and is not the updater -> recreated
# dev_workspace: own folder, the updater, auto-update on           -> left alone
# dev_gone:      its working directory is not on the host          -> skipped
# `docker exec` (used by check) succeeds everywhere except in dev_stray.
cat > "$SANDBOX/bin/docker" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  ps) printf '%s\n' dev_idle dev_busy dev_done dev_stray dev_workspace dev_gone ;;
  top) [ "$2" = dev_busy ] && echo "1234 /dev-home/.npm-global/bin/claude" ;;
  inspect)
    name="${*: -1}"
    case "$3" in
      *WorkingDir*) echo "/workspace/owner/${name#dev_}" ;;
      *Env*) echo HOME=/dev-home
             case "$name" in dev_done|dev_stray|dev_workspace)
               echo "CLAUDE_CONFIG_DIR=/dev-home/.claude-containers/$name" ;; esac
             case "$name" in dev_idle|dev_busy|dev_done|dev_gone)
               echo DISABLE_AUTOUPDATER=1 ;; esac ;;
    esac ;;
  exec) [ "${*: -4:1}" = dev_stray ] && { echo "OCI runtime exec failed"; exit 126; }
        echo ok ;;
esac
exit 0
FAKE
cat > "$SANDBOX/bin/dev" <<'FAKE'
#!/usr/bin/env bash
echo "dev $* in $(pwd)" >> "$FAKE_LOG"
FAKE
chmod +x "$SANDBOX/bin/docker" "$SANDBOX/bin/dev"

migrate() {
  PATH="$SANDBOX/bin:$PATH" DEV_REPO_ROOT="$SANDBOX/repos" bash "$HERE/migrate-claude-config.sh" "$@" 2>&1
}

fail=0; total=0
check() { total=$((total + 1)); if ! eval "$2"; then echo "FAIL: $1"; fail=$((fail + 1)); fi; }

out="$(migrate recreate)"; status=$?
check "idle container recreated detached from its repo" \
  'grep -qx "dev --recreate --detach --name idle in $SANDBOX/repos/owner/idle" "$FAKE_LOG"'
check "container with the wrong auto-update setting recreated" \
  'grep -qx "dev --recreate --detach --name stray in $SANDBOX/repos/owner/stray" "$FAKE_LOG"'
check "nothing else recreated"            '[ "$(wc -l < "$FAKE_LOG")" -eq 2 ]'
check "busy container named as skipped"   'grep -q "dev_busy: claude is running" <<<"$out"'
check "missing working directory named"   'grep -q "dev_gone: its working directory" <<<"$out"'
check "migrated containers reported"      'grep -q "dev_done already has its own config folder" <<<"$out" && grep -q "dev_workspace already" <<<"$out"'
check "skips make the exit code non-zero" '[ "$status" -ne 0 ]'

out="$(migrate check)"; status=$?
check "a failed exec is a problem, not a pass" 'grep -q "dev_stray: the in-container check did not finish" <<<"$out"'
check "a healthy container passes"             'grep -q "✅ dev_done:" <<<"$out"'
check "a second auto-updater is named"         'grep -q "it is on in: dev_stray dev_workspace" <<<"$out"'
check "check exits non-zero on problems"       '[ "$status" -ne 0 ]'

out="$(DEV_CLAUDE_UPDATER=done migrate check)"
check "the updater must be the named one" 'grep -q "should be on in dev_done only" <<<"$out"'

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ] || echo "$out"
[ "$fail" -eq 0 ]
