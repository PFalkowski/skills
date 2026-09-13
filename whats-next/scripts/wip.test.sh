#!/usr/bin/env bash
# Exercises the POSIX wip launcher (whats-next/scripts/wip), the path CI and every
# non-pwsh user actually run -- S0a only ever automated wip.ps1's build-once/build-skip/
# missing-SDK behaviour, never this script's own copy of it.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$ROOT/scripts/wip"

fail=0
total=0

make_fake_dotnet() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/dotnet" <<'FAKE'
#!/usr/bin/env bash
set -eu
if [ "$1" = "--list-sdks" ]; then
  if [ "${FAKE_DOTNET_NO_SDK:-}" != "1" ]; then
    echo "10.0.400 [/fake/sdk]"
  fi
  exit 0
fi
if [ "$1" = "publish" ]; then
  echo "publish $*" >> "$FAKE_DOTNET_LOG"
  prev=""
  out_dir=""
  for a in "$@"; do
    if [ "$prev" = "-o" ]; then out_dir="$a"; fi
    prev="$a"
  done
  mkdir -p "$out_dir"
  touch "$out_dir/WhatsNext.dll"
  exit 0
fi
case "$1" in
  *WhatsNext.dll)
    echo "FAKE_RUN $*"
    exit "${FAKE_EXIT_CODE:-0}"
    ;;
esac
exit 99
FAKE
  chmod +x "$bin_dir/dotnet"
}

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

FAKE_BIN="$TMP_ROOT/fakebin"
STATE_ROOT="$TMP_ROOT/state"
PUBLISH_LOG="$TMP_ROOT/publish.log"
: > "$PUBLISH_LOG"
make_fake_dotnet "$FAKE_BIN"

total=$((total + 1))
out=$(PATH="$FAKE_BIN:$PATH" AGENTS_STATE="$STATE_ROOT" FAKE_DOTNET_LOG="$PUBLISH_LOG" FAKE_EXIT_CODE=42 "$LAUNCHER")
status=$?
builds=$(wc -l < "$PUBLISH_LOG" | tr -d ' ')
if [ "$status" -ne 42 ] || [ "$builds" -ne 1 ] || ! printf '%s' "$out" | grep -q 'FAKE_RUN'; then
  echo "FAIL: a cold cache should build once and exit with the child's code (status=$status builds=$builds)"
  echo "$out"
  fail=$((fail + 1))
fi

total=$((total + 1))
out=$(PATH="$FAKE_BIN:$PATH" AGENTS_STATE="$STATE_ROOT" FAKE_DOTNET_LOG="$PUBLISH_LOG" FAKE_EXIT_CODE=43 "$LAUNCHER")
status=$?
builds=$(wc -l < "$PUBLISH_LOG" | tr -d ' ')
if [ "$status" -ne 43 ] || [ "$builds" -ne 1 ]; then
  echo "FAIL: a warm cache should skip the build (status=$status builds=$builds)"
  echo "$out"
  fail=$((fail + 1))
fi

FAKE_BIN2="$TMP_ROOT/fakebin-no-sdk"
STATE_ROOT2="$TMP_ROOT/state-no-sdk"
PUBLISH_LOG2="$TMP_ROOT/publish-no-sdk.log"
: > "$PUBLISH_LOG2"
make_fake_dotnet "$FAKE_BIN2"

total=$((total + 1))
out=$(PATH="$FAKE_BIN2:$PATH" AGENTS_STATE="$STATE_ROOT2" FAKE_DOTNET_LOG="$PUBLISH_LOG2" FAKE_DOTNET_NO_SDK=1 "$LAUNCHER" 2>&1)
status=$?
builds=$(wc -l < "$PUBLISH_LOG2" | tr -d ' ')
if [ "$status" -eq 0 ] || [ "$builds" -ne 0 ] || \
   ! printf '%s' "$out" | grep -qF ".NET 10 SDK not found. Install it from https://dotnet.microsoft.com/download/dotnet/10.0 and try again."; then
  echo "FAIL: a missing .NET 10 SDK should print the exact message, exit non-zero, and never build"
  echo "$out"
  fail=$((fail + 1))
fi

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
