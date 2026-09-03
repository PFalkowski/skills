#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

broken=0
while IFS=: read -r f l t; do
  d=$(dirname "$f")
  if [ ! -f "$d/$t" ]; then
    echo "BROKEN $f:$l -> $t"
    broken=1
  fi
done < <(grep -rnoE "\.\.(/[A-Za-z0-9_.-]+)+\.md" --include="*.md" . | grep -v "^\./archive/")

exit "$broken"
