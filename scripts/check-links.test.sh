#!/usr/bin/env bash
# Exercises check-links.sh against fixtures: a good anchor passes; a broken cross-file anchor
# and a broken same-file anchor each fail, as does a duplicate-heading suffix that does not exist.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/check-links.sh"

fail=0
expect_status() {
  local desc="$1" expected="$2" dir="$3" out status
  out=$(CHECK_LINKS_ROOT="$dir" bash "$CHECK" 2>&1); status=$?
  if [ "$status" -ne "$expected" ]; then
    echo "FAIL: $desc -- expected exit $expected, got $status"
    echo "$out"
    fail=$((fail + 1))
  fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/good" "$TMP/cross" "$TMP/same" "$TMP/dup"
cat > "$TMP/good/target.md" <<'MD'
# Title
## Routing table (v2)
## Snake_case and-dash
## Again
## Again
MD
cat > "$TMP/good/src.md" <<'MD'
# Source
See [a](target.md#routing-table-v2), [b](target.md#snake_case-and-dash), [c](target.md#again-1), [d](#source).
```
[ignored](target.md#nope)
```
MD
cat > "$TMP/cross/target.md" <<'MD'
# Title
MD
echo '[x](target.md#missing)' > "$TMP/cross/src.md"
printf '# Here\n[x](#missing)\n' > "$TMP/same/src.md"
printf '# Same\n[x](#same-1)\n' > "$TMP/dup/src.md"

expect_status "good anchors pass" 0 "$TMP/good"
expect_status "broken cross-file anchor fails" 1 "$TMP/cross"
expect_status "broken same-file anchor fails" 1 "$TMP/same"
expect_status "missing duplicate suffix fails" 1 "$TMP/dup"

[ "$fail" -eq 0 ] && echo "check-links.test.sh: all passed"
exit "$fail"
