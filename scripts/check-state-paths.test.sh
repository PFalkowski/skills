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

# A fixture skill that declares a bare file directly under .agents/ (no
# <slug>/ segment) must be caught -- this is exactly the shape
# docs/agent-state.md's directory rule names as non-conforming. The one
# real occurrence today, recurring-improvement's .agents/recurring-backlog.md,
# is grandfathered as a named migration item (#159); this fixture uses a
# different filename so the grandfather entry can't be why it's silent.
FIXTURE_ROOT2=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT" "$FIXTURE_ROOT2"' EXIT
mkdir -p "$FIXTURE_ROOT2/bare-file-fixture-skill"
cat > "$FIXTURE_ROOT2/bare-file-fixture-skill/SKILL.md" <<'EOF'
---
name: bare-file-fixture-skill
description: 'Fixture only, not a real skill.'
---
# bare-file-fixture-skill

State lives at `.agents/bare-fixture-state.md`, not under a skill segment.
EOF

out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT2" bash "$CHECK" 2>&1); status=$?
total=$((total + 1))
if [ "$status" -eq 0 ]; then
  echo "FAIL: fixture with a bare file directly under .agents/ should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q 'bare file directly under'; then
  echo "FAIL: bare-file-under-.agents/ violation was not named"
  echo "$out"
  fail=$((fail + 1))
fi

# A fixture skill whose .agents/ mentions are all properly nested under a
# skill segment (the conforming shape) must stay green -- proves the new
# bare-file check doesn't also flag the pattern it's meant to allow.
FIXTURE_ROOT3=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT" "$FIXTURE_ROOT2" "$FIXTURE_ROOT3"' EXIT
mkdir -p "$FIXTURE_ROOT3/nested-fixture-skill"
cat > "$FIXTURE_ROOT3/nested-fixture-skill/SKILL.md" <<'EOF'
---
name: nested-fixture-skill
description: 'Fixture only, not a real skill.'
---
# nested-fixture-skill

State lives at `.agents/nested-fixture-skill/journal.md`, per convention.
EOF
printf '.agents/\n' > "$FIXTURE_ROOT3/.gitignore"

expect_status "fixture with a properly nested .agents/ path is green" 0 \
  env CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT3" bash "$CHECK"

# The gitignore rule: docs/agent-state.md claims .agents/ is ignored
# wholesale by a single .gitignore line. A fixture missing that line must
# be caught even when every skill's markdown is otherwise conforming --
# this is what proves the claim is enforced, not just asserted.
FIXTURE_ROOT4=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT" "$FIXTURE_ROOT2" "$FIXTURE_ROOT3" "$FIXTURE_ROOT4"' EXIT
mkdir -p "$FIXTURE_ROOT4/nested-fixture-skill"
cp "$FIXTURE_ROOT3/nested-fixture-skill/SKILL.md" "$FIXTURE_ROOT4/nested-fixture-skill/SKILL.md"
# deliberately no .gitignore here

out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT4" bash "$CHECK" 2>&1); status=$?
total=$((total + 1))
if [ "$status" -eq 0 ]; then
  echo "FAIL: fixture missing a .gitignore .agents/ line should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q '\.gitignore'; then
  echo "FAIL: missing-gitignore-rule violation did not name .gitignore"
  echo "$out"
  fail=$((fail + 1))
fi

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
