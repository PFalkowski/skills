#!/usr/bin/env bash
# Fails on a relative markdown link whose target file does not exist.
# Covers both `../other-skill/FILE.md` and same-directory `FILE.md`, since a skill that absorbs
# another one's reference material turns the first form into the second.
set -euo pipefail
cd "$(dirname "$0")/.."

broken=0
while IFS=: read -r f l t; do
  d=$(dirname "$f")
  if [ ! -f "$d/$t" ]; then
    echo "BROKEN $f:$l -> $t"
    broken=1
  fi
done < <(
  find . -name '*.md' -not -path './archive/*' -print0 |
  while IFS= read -r -d '' f; do
    # Blank out fenced code blocks, keeping line numbers, so an illustrative path in an example
    # (`- [title](slug.md)`) is not mistaken for a link that ought to resolve.
    awk '/^[[:space:]]*```/ { fence = !fence; print ""; next } fence { print ""; next } { print }' "$f" |
    grep -noE "\]\([A-Za-z0-9_.-]+\.md(#[A-Za-z0-9_-]*)?\)|\.\.(/[A-Za-z0-9_.-]+)+\.md" |
    sed -E "s|^([0-9]+):\]\((.*)\)\$|\1:\2|; s|#[A-Za-z0-9_-]*\$||; s|^|$f:|" || true
  done
)

exit "$broken"
