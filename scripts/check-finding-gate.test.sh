#!/usr/bin/env bash
# Exercises check-finding-gate.sh against a fixture tree so the real skill
# files are never touched: green when all twelve files carry the anchor
# clause (even inside a fenced code block), non-zero and naming the file
# when one lacks it, and non-zero and naming the file when one is missing
# outright.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/check-finding-gate.sh"

fail=0
total=0

FIXTURE_ROOT=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

files=(
  fact-check/SKILL.md
  code-review-grill/SKILL.md
  code-review-grill/REFERENCE.md
  fix-pr/SKILL.md
  nights-watch/SKILL.md
  nights-watch/WATCH.md
  nights-watch/HUNT.md
  nights-watch/RANGING.md
  nights-watch/TRIAGE.md
  nights-watch/GRILL.md
  desloppify/RUNBOOK.md
  housekeeping/FILING.md
)

write_clean_fixture() {
  local root="$1"
  rm -rf "$root"
  mkdir -p "$root/scripts"
  cp "$ROOT/scripts/check-finding-gate.sh" "$root/scripts/check-finding-gate.sh"
  for f in "${files[@]}"; do
    mkdir -p "$root/$(dirname "$f")"
    cat > "$root/$f" <<'EOF'
# Fixture

This claim is grounded only by running it and showing the real output.
EOF
  done
}

# All twelve files present and carrying the clause: must be green.
write_clean_fixture "$FIXTURE_ROOT"
total=$((total + 1))
out=$(cd "$FIXTURE_ROOT" && bash scripts/check-finding-gate.sh 2>&1); status=$?
if [ "$status" -ne 0 ]; then
  echo "FAIL: clean fixture (all twelve files, all carrying the clause) should be green"
  echo "$out"
  fail=$((fail + 1))
fi

# The clause inside a fenced code block still counts -- this is the shape
# code-review-grill/REFERENCE.md actually needs, so the check must not skip
# fences.
write_clean_fixture "$FIXTURE_ROOT"
cat > "$FIXTURE_ROOT/code-review-grill/REFERENCE.md" <<'EOF'
# Reference

```
A claim is grounded only by running it and showing the real output.
```
EOF
total=$((total + 1))
out=$(cd "$FIXTURE_ROOT" && bash scripts/check-finding-gate.sh 2>&1); status=$?
if [ "$status" -ne 0 ]; then
  echo "FAIL: clause inside a fenced code block should still count"
  echo "$out"
  fail=$((fail + 1))
fi

# One file missing the clause: must fail and name that file.
write_clean_fixture "$FIXTURE_ROOT"
cat > "$FIXTURE_ROOT/fix-pr/SKILL.md" <<'EOF'
# Fixture

No anchor clause here.
EOF
total=$((total + 1))
out=$(cd "$FIXTURE_ROOT" && bash scripts/check-finding-gate.sh 2>&1); status=$?
if [ "$status" -eq 0 ]; then
  echo "FAIL: fixture missing the clause in one file should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q 'fix-pr/SKILL.md'; then
  echo "FAIL: the file missing the clause was not named"
  echo "$out"
  fail=$((fail + 1))
fi

# One listed file missing outright: must fail loudly and name that file,
# not be silently skipped.
write_clean_fixture "$FIXTURE_ROOT"
rm -f "$FIXTURE_ROOT/nights-watch/GRILL.md"
total=$((total + 1))
out=$(cd "$FIXTURE_ROOT" && bash scripts/check-finding-gate.sh 2>&1); status=$?
if [ "$status" -eq 0 ]; then
  echo "FAIL: fixture with a missing listed file should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q 'nights-watch/GRILL.md'; then
  echo "FAIL: the missing file was not named"
  echo "$out"
  fail=$((fail + 1))
fi

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
