#!/usr/bin/env bash
# Fails unless docs/disclosure.md exists and each skill file that files tickets
# or writes PR text links it. Presence check only; a missing file fails loudly.
set -euo pipefail
cd "$(dirname "$0")/.."

link='../docs/disclosure.md'

files=(
  manager/SKILL.md
  manager/DECIDING.md
  fix-pr/SKILL.md
  go-go-go/SKILL.md
  code-review-grill/SKILL.md
  code-review-grill/REFERENCE.md
)

status=0
if [ ! -f docs/disclosure.md ]; then
  echo "FAIL docs/disclosure.md: file does not exist"
  status=1
fi
for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAIL $f: file does not exist"
    status=1
    continue
  fi
  if ! grep -qF "$link" "$f"; then
    echo "FAIL $f: missing the link to $link"
    status=1
  fi
done

exit "$status"
