#!/usr/bin/env bash
# Exercises check-state-paths.sh: green against the real repo tree with no
# skill migrated, and non-zero once a fixture skill declares a state root
# outside .agents/<skill>/ and outside the grandfather allowlist -- in a
# sibling markdown file, not SKILL.md, since that is the gap the ticket's
# own SKILL.md-only wording would miss.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/check-state-paths.sh"

fail=0
total=0
expect_status() {
  local desc="$1" expected="$2"; shift 2
  local out status
  total=$((total + 1))
  out=$("$@" 2>&1); status=$?
  if [ "$status" -ne "$expected" ]; then
    echo "FAIL: $desc -- expected exit $expected, got $status"
    echo "$out"
    fail=$((fail + 1))
  fi
}

# The real tree, unmigrated, must be green: this is the proof the check can
# land without breaking CI on merge.
expect_status "clean checkout is green" 0 bash "$CHECK"

# A fixture skill whose SKILL.md is clean but whose sibling doc declares a
# rogue state root must still be caught.
FIXTURE_ROOT=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT"' EXIT
mkdir -p "$FIXTURE_ROOT/rogue-fixture-skill"
cat > "$FIXTURE_ROOT/rogue-fixture-skill/SKILL.md" <<'EOF'
---
name: rogue-fixture-skill
description: 'Fixture only, not a real skill.'
---
# rogue-fixture-skill
No state paths mentioned here.
EOF
cat > "$FIXTURE_ROOT/rogue-fixture-skill/SIDECAR.md" <<'EOF'
# Sidecar

Writes its run log to `.rogue-fixture-state/journal.md`, not `.agents/`.
EOF

out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT" bash "$CHECK" 2>&1); status=$?
total=$((total + 1))
if [ "$status" -eq 0 ]; then
  echo "FAIL: fixture with a rogue state root should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q 'SIDECAR.md'; then
  echo "FAIL: fixture violation did not name the offending file"
  echo "$out"
  fail=$((fail + 1))
fi

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
