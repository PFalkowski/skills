#!/usr/bin/env bash
# A GitHub list route returns 30 items per page, and gh api reads one page unless
# given --paginate, so a list read without it drops the rest silently.
set -euo pipefail
cd "$(dirname "$0")/.."

files=(
  fix-pr/SKILL.md
  nights-watch/RANGING.md
  docs/cloud-session.md
)

status=0
for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAIL $f: file does not exist"
    status=1
    continue
  fi
  while IFS= read -r hit; do
    echo "FAIL $f:${hit%%:*}: gh api list read without --paginate"
    status=1
  done < <(grep -nE 'gh api.*(/comments|/reviews|/review_threads)' "$f" | grep -v -- '--paginate' || true)
done

exit "$status"
