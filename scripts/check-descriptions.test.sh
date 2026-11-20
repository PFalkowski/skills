#!/usr/bin/env bash
# Exercises check-descriptions.sh on a fixture repo: a SKILL.md description over the limit fails,
# and so does a workflows/*.js meta.description over it, since that text is loaded into the model's
# context the same way. A short description of either kind passes. CI runs the check against the
# real tree itself, one line above this test, so no case here does.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/scripts" "$FIXTURE/fixture-skill" "$FIXTURE/workflows"
cp "$ROOT/scripts/check-descriptions.sh" "$FIXTURE/scripts/"
cat > "$FIXTURE/fixture-skill/SKILL.md" <<'EOF'
---
name: fixture-skill
description: 'Fixture only, not a real skill.'
---
# fixture-skill
EOF
cat > "$FIXTURE/workflows/short.js" <<'EOF'
export const meta = {
  name: 'short',
  description: 'A short description of what the workflow does.',
}
EOF
CHECK="$FIXTURE/scripts/check-descriptions.sh"

expect_status "short skill and workflow descriptions pass" 0 bash "$CHECK"

LONG=$(printf 'x%.0s' $(seq 1 121))
cat > "$FIXTURE/workflows/long.js" <<EOF
export const meta = {
  name: 'long',
  description: '$LONG',
}
EOF
expect_status "a workflow description of 121 characters fails" 1 bash "$CHECK"
out=$(bash "$CHECK" 2>&1)
total=$((total + 1))
if ! printf '%s' "$out" | grep -q 'workflows/long.js'; then
  echo "FAIL: the failure names the workflow file"; echo "$out"; fail=$((fail + 1))
fi

EXACT=$(printf 'x%.0s' $(seq 1 120))
sed -i "s/$LONG/$EXACT/" "$FIXTURE/workflows/long.js"
expect_status "a workflow description of exactly 120 characters passes" 0 bash "$CHECK"

cat > "$FIXTURE/workflows/double.js" <<EOF
export const meta = {
  name: 'double',
  description: "$LONG",
}
EOF
expect_status "a double-quoted workflow description is read too" 1 bash "$CHECK"
rm "$FIXTURE/workflows/double.js"

LONG_SKILL=$(printf 'y%.0s' $(seq 1 121))
sed -i "s/Fixture only, not a real skill./$LONG_SKILL/" "$FIXTURE/fixture-skill/SKILL.md"
expect_status "a skill description of 121 characters still fails" 1 bash "$CHECK"

sed -i "s/$LONG_SKILL/Fixture only, not a real skill./" "$FIXTURE/fixture-skill/SKILL.md"

write_shape() { cat > "$FIXTURE/workflows/shape.js"; }
write_shape <<EOF
export const meta = {
  name: 'shape',
  description: 'a first part that is short ' +
    '$LONG',
}
EOF
expect_status "a concatenated workflow description fails, since only its first line could be counted" 1 bash "$CHECK"
write_shape <<EOF
export const meta = {
  name: 'shape',
  description:
    '$LONG',
}
EOF
expect_status "a workflow description on the line after the key fails" 1 bash "$CHECK"
write_shape <<EOF
export const meta = { name: 'shape', description: '$LONG' }
EOF
expect_status "a one-line meta fails" 1 bash "$CHECK"
write_shape <<'EOF'
export const meta = {
  name: 'shape',
  description: '',
}
EOF
expect_status "an empty workflow description fails" 1 bash "$CHECK"
write_shape <<EOF
export const meta = {
  name: 'shape',
  phases: [],
}
const later = { description: '$LONG' }
EOF
expect_status "a workflow with no meta.description fails, and does not read a later description" 1 bash "$CHECK"
write_shape <<'EOF'
export const meta = {
  name: 'shape',
  description: 'Short.',
  whenToUse: 'abcd' +
    'efgh',
}
EOF
expect_status "a concatenated whenToUse fails" 1 bash "$CHECK"

printed_total() { bash "$CHECK" 2>&1 | sed -n 's/^total across all descriptions: \([0-9]*\) chars$/\1/p'; }
rm "$FIXTURE/workflows/shape.js"
before=$(printed_total)
write_shape <<'EOF'
export const meta = {
  name: 'shape',
  description: 'Short.',
  whenToUse: 'abcdefghij',
}
EOF
expect_status "a whenToUse longer than the description cap is not capped" 0 bash "$CHECK"
after=$(printed_total)
total=$((total + 1))
if [ "$((after - before))" -ne 16 ]; then
  echo "FAIL: a workflow's description and whenToUse count in the printed totals -- expected +16 chars, got $((after - before))"
  fail=$((fail + 1))
fi
rm "$FIXTURE/workflows/shape.js"

echo "check-descriptions: $((total - fail))/$total cases passed"
[ "$fail" -eq 0 ]
