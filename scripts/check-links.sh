#!/usr/bin/env bash
# Fails on a relative markdown link whose target file does not exist.
# Covers both `../other-skill/FILE.md` and same-directory `FILE.md`, since a skill that absorbs
# another one's reference material turns the first form into the second.
# Also fails on a `#anchor` that matches no heading in the target file (the same file for `](#x)`),
# using GitHub's slug rules: lowercase, drop punctuation except - and _, spaces to -, repeats get -1, -2.
set -euo pipefail
cd "$(dirname "$0")/.."
cd "${CHECK_LINKS_ROOT:-.}"

blank_fences() {
  awk '/^[[:space:]]*```/ { fence = !fence; print ""; next } fence { print ""; next } { print }' "$1"
}

heading_slugs() {
  blank_fences "$1" | awk '
    /^#{1,6}[[:space:]]+/ {
      t = $0
      sub(/^#+[[:space:]]+/, "", t); sub(/[[:space:]]+#+[[:space:]]*$/, "", t)
      t = tolower(t); gsub(/—|–|’|“|”|…/, "", t); gsub(/[!-,.\/:-@\[-^`{-~]/, "", t); gsub(/ /, "-", t)
      n = seen[t]++
      print (n ? t "-" n : t)
    }'
}

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
    blank_fences "$f" |
    grep -noE "\]\([A-Za-z0-9_.-]+\.md(#[A-Za-z0-9_-]*)?\)|\.\.(/[A-Za-z0-9_.-]+)+\.md" |
    sed -E "s|^([0-9]+):\]\((.*)\)\$|\1:\2|; s|#[A-Za-z0-9_-]*\$||; s|^|$f:|" || true
  done
)

while IFS=: read -r f l t a; do
  target="$f"
  [ -n "$t" ] && target="$(dirname "$f")/$t"
  [ -f "$target" ] || continue
  if ! heading_slugs "$target" | grep -qxF -- "$a"; then
    echo "BROKEN ANCHOR $f:$l -> ${t:-(same file)}#$a"
    broken=1
  fi
done < <(
  find . -name '*.md' -not -path './archive/*' -print0 |
  while IFS= read -r -d '' f; do
    blank_fences "$f" |
    grep -noE "\]\(([A-Za-z0-9_./-]+\.md)?#[A-Za-z0-9_-]+\)" |
    sed -E "s|^([0-9]+):\]\(([^#]*)#(.*)\)\$|\1:\2:\3|; s|^|$f:|" || true
  done
)

exit "$broken"
