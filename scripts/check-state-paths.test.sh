#!/usr/bin/env bash
# Exercises check-state-paths.sh: green against the real repo tree, and
# non-zero once a fixture skill declares a state root outside
# .agents/<skill>/ that is not a listed deliverable -- including in a sibling
# markdown file rather than SKILL.md, since that is the gap a SKILL.md-only
# scan would miss. Also covers every retired path from docs/agent-state.md,
# so a completed migration cannot silently revert.
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
# docs/agent-state.md's directory rule names as non-conforming. Nothing is
# exempt from this rule any more: recurring-improvement's
# .agents/recurring-backlog.md, the one real occurrence, has migrated.
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

# The specific bare file this migration removed must be caught by name.
# The fixture above uses an invented filename, so it stays green if someone
# re-exempts recurring-backlog.md in particular -- which is exactly how this
# migration would silently revert. Naming it here is what closes that.
FIXTURE_ROOT2B=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT" "$FIXTURE_ROOT2" "$FIXTURE_ROOT2B" "$FIXTURE_ROOT3" "$FIXTURE_ROOT4"' EXIT
mkdir -p "$FIXTURE_ROOT2B/recurring-improvement"
printf '.agents/\n' > "$FIXTURE_ROOT2B/.gitignore"
cat > "$FIXTURE_ROOT2B/recurring-improvement/SKILL.md" <<'EOF'
---
name: recurring-improvement
description: 'Fixture only, not a real skill.'
---
# recurring-improvement

Backlog at `.agents/recurring-backlog.md`.
EOF

out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT2B" bash "$CHECK" 2>&1); status=$?
total=$((total + 1))
if [ "$status" -eq 0 ]; then
  echo "FAIL: the migrated .agents/recurring-backlog.md must not be exempt again"
  fail=$((fail + 1))
fi

# Each retired path must be caught and told where its state went. These are
# the entries the generic dot-directory scan structurally cannot see: a
# non-dot path never matches its pattern, and .nights-watch/ is exempt as a
# whole so its tracked library/ can stay. Without this pass a migrated path
# could reappear in a skill's prose and nothing would fail.
FIXTURE_ROOT5=$(mktemp -d)
trap 'rm -rf "$FIXTURE_ROOT" "$FIXTURE_ROOT2" "$FIXTURE_ROOT2B" "$FIXTURE_ROOT3" "$FIXTURE_ROOT4" "$FIXTURE_ROOT5"' EXIT
mkdir -p "$FIXTURE_ROOT5/retired-fixture-skill"
printf '.agents/\n' > "$FIXTURE_ROOT5/.gitignore"

check_retired() {
  local desc="$1" body="$2" moved_to="$3"
  local out status
  total=$((total + 1))
  cat > "$FIXTURE_ROOT5/retired-fixture-skill/SKILL.md" <<EOF
---
name: retired-fixture-skill
description: 'Fixture only, not a real skill.'
---
# retired-fixture-skill

$body
EOF
  out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT5" bash "$CHECK" 2>&1); status=$?
  if [ "$status" -eq 0 ]; then
    echo "FAIL: retired path '$desc' should not be green"
    fail=$((fail + 1))
  elif ! printf '%s' "$out" | grep -qF "$moved_to"; then
    echo "FAIL: retired path '$desc' was flagged without naming where it moved ($moved_to)"
    echo "$out"
    fail=$((fail + 1))
  fi
}

check_retired 'nights-watch journal (uppercase)' \
  'Logbook at `.nights-watch/JOURNAL.md`.' '.agents/nights-watch/'
check_retired 'nights-watch journal (lowercase)' \
  'Logbook at `.nights-watch/journal.md`.' '.agents/nights-watch/'
check_retired 'nights-watch chronicles' \
  'Notes in `.nights-watch/chronicles/`.' '.agents/nights-watch/'
check_retired 'nights-watch locks' \
  'Claims in `.nights-watch/locks/`.' '.agents/nights-watch/'
check_retired 'nights-watch hunts' \
  'Watermark in `.nights-watch/hunts/`.' '.agents/nights-watch/'
check_retired 'sdlc run logs' \
  'Phase logs under `docs/sdlc/runs/`.' '.agents/sdlc-old-fashioned/runs/'
# This one path has two owners (sdlc-old-fashioned and the sdlc-workhorse
# workflow default) and so two destinations, which is why its message points
# at the table rather than naming one and misleading the other's reader.
check_retired 'sdlc backlog' \
  'Deferred questions in `prompts/sdlc-backlog.md`.' 'Retired paths'

# The three dot-roots that migrated. Without an entry of their own they are
# caught only by the generic dot-directory scan, so one edit re-adding them
# to the deliverable exemption would re-permit them in silence.
check_retired 'housekeeping chronicles' \
  'Chronicles in `.housekeeping/chronicles/`.' '.agents/housekeeping/'
check_retired 'recurring-improvement root' \
  'Backlog at `.recurring-improvement/recurring-backlog.md`.' 'docs/recurring-backlog.md'
check_retired 'sdlc-workhorse chronicles' \
  'Chronicles in `.sdlc/chronicles/`.' '.agents/sdlc-workhorse/'

# Qualified spellings. A retired path is just as wrong written with a ~/,
# <repo>/ or ./ prefix, and those are the spellings these skills actually
# use -- a check that only matched the bare form would let the likeliest
# regression through while reporting green.
check_retired 'home-directory Hunt root' \
  'Public state at `~/.nights-watch/<repo-slug>/hunts/`.' '.agents/nights-watch/'
check_retired 'repo-prefixed sdlc runs' \
  'Logs at `<repo>/docs/sdlc/runs/`.' '.agents/sdlc-old-fashioned/runs/'
check_retired 'dot-slash prefixed journal' \
  'Logbook at `./.nights-watch/JOURNAL.md`.' '.agents/nights-watch/'

# Only library/ is a deliverable under .nights-watch/. A subpath that did
# not exist at migration time must not inherit the directory's exemption.
check_retired 'newly invented nights-watch subpath' \
  'Reports in `.nights-watch/reports/`.' '.agents/nights-watch/'

# A retired path in a SIBLING file, not SKILL.md. Every check_retired
# fixture above writes SKILL.md, so narrowing the retired pass to SKILL.md
# alone would leave them all green -- and a skill's layout prose usually
# lives in a sibling file, which is the whole reason the generic scan globs
# *.md. This pins that for the retired pass too.
total=$((total + 1))
cat > "$FIXTURE_ROOT5/retired-fixture-skill/SKILL.md" <<'EOF'
---
name: retired-fixture-skill
description: 'Fixture only, not a real skill.'
---
# retired-fixture-skill
No state paths mentioned here.
EOF
cat > "$FIXTURE_ROOT5/retired-fixture-skill/LAYOUT.md" <<'EOF'
# Layout

Phase logs go under `docs/sdlc/runs/`.
EOF
out=$(CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT5" bash "$CHECK" 2>&1); status=$?
if [ "$status" -eq 0 ]; then
  echo "FAIL: a retired path in a sibling file should not be green"
  fail=$((fail + 1))
elif ! printf '%s' "$out" | grep -q 'LAYOUT.md'; then
  echo "FAIL: retired path in a sibling file was not attributed to that file"
  echo "$out"
  fail=$((fail + 1))
fi
rm -f "$FIXTURE_ROOT5/retired-fixture-skill/LAYOUT.md"

# The tracked Library is a deliverable and must stay green: it is the reason
# .nights-watch/ is exempt as a whole, so a check that flagged it would have
# made the exemption meaningless. Its sibling human-facing paths, which the
# migration deliberately left alone, must stay green too.
cat > "$FIXTURE_ROOT5/retired-fixture-skill/SKILL.md" <<'EOF'
---
name: retired-fixture-skill
description: 'Fixture only, not a real skill.'
---
# retired-fixture-skill

Curated memory in `.nights-watch/library/INDEX.md`, rejected requests in
`.out-of-scope/`, the schedule in `docs/recurring-backlog.md`, the queue in
`prompts/backlog.md`, and run state in `.agents/retired-fixture-skill/runs/`.
EOF
expect_status "deliverable paths beside the retired ones stay green" 0 \
  env CHECK_STATE_PATHS_ROOT="$FIXTURE_ROOT5" bash "$CHECK"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
