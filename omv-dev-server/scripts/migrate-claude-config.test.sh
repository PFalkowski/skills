#!/usr/bin/env bash
# Runs `migrate-claude-config.sh recreate` against a fake `docker` and a fake `dev`.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/bin" "$SANDBOX/repos/owner/idle" "$SANDBOX/repos/owner/busy" "$SANDBOX/repos/owner/done"
export FAKE_LOG="$SANDBOX/log"

# dev_idle: on the shared folder, nothing running   -> recreated
# dev_busy: on the shared folder, claude running    -> skipped
# dev_done: already has its own folder              -> skipped
# dev_gone: its working directory is not on the host -> skipped
cat > "$SANDBOX/bin/docker" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  ps) printf '%s\n' dev_idle dev_busy dev_done dev_gone ;;
  top) [ "$2" = dev_busy ] && echo "1234 /dev-home/.npm-global/bin/claude" ;;
  inspect)
    name="${*: -1}"
    case "$3" in
      *WorkingDir*) echo "/workspace/owner/${name#dev_}" ;;
      *Env*) echo HOME=/dev-home
             [ "$name" = dev_done ] && echo CLAUDE_CONFIG_DIR=/dev-home/.claude-containers/dev_done ;;
    esac ;;
esac
exit 0
FAKE
cat > "$SANDBOX/bin/dev" <<'FAKE'
#!/usr/bin/env bash
echo "dev $* in $(pwd)" >> "$FAKE_LOG"
FAKE
chmod +x "$SANDBOX/bin/docker" "$SANDBOX/bin/dev"

out="$(PATH="$SANDBOX/bin:$PATH" DEV_REPO_ROOT="$SANDBOX/repos" bash "$HERE/migrate-claude-config.sh" recreate 2>&1)"
status=$?
touch "$FAKE_LOG"

fail=0
check() { if ! eval "$2"; then echo "FAIL: $1"; fail=$((fail + 1)); fi; }
check "idle container recreated detached from its repo" \
  'grep -qx "dev --recreate --detach --name idle in $SANDBOX/repos/owner/idle" "$FAKE_LOG"'
check "only the idle container recreated" '[ "$(wc -l < "$FAKE_LOG")" -eq 1 ]'
check "busy container named as skipped" 'grep -q "dev_busy: claude is running" <<<"$out"'
check "missing working directory named"  'grep -q "dev_gone: its working directory" <<<"$out"'
check "migrated container reported"      'grep -q "dev_done already has its own config folder" <<<"$out"'
check "skips make the exit code non-zero" '[ "$status" -ne 0 ]'

[ "$fail" -eq 0 ] && echo "6/6 passed" || { echo "$out"; cat "$FAKE_LOG"; }
[ "$fail" -eq 0 ]
