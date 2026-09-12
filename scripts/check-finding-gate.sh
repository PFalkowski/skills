#!/usr/bin/env bash
# Fails unless the anchor clause below appears, as a literal fixed string,
# in each of the thirteen files listed. This is the only thing it checks: no
# absence scan, no symbol scan, no glob over all skills, no occurrence
# count, no judgment on surrounding prose. A missing file fails loudly
# rather than being silently skipped. The clause counts wherever it
# appears, including inside fenced code blocks -- in code-review-grill's
# REFERENCE.md the clause's required home is inside a fenced prompt
# template, so a check that skipped fences would fail on the file that
# matters most.
set -euo pipefail
cd "$(dirname "$0")/.."

clause='is grounded only by running it and showing the real output'

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
  housekeeping/SKILL.md
  housekeeping/SWEEP.md
)

status=0
for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAIL $f: file does not exist"
    status=1
    continue
  fi
  if ! grep -qF "$clause" "$f"; then
    echo "FAIL $f: missing the anchor clause"
    status=1
  fi
done

exit "$status"
