#!/usr/bin/env bash
# Fails on a SKILL.md description over 1024 characters or with an unquoted ": "; warns above 320.
set -u
cd "$(dirname "$0")/.."
hard=1024 soft=320 status=0
for f in */SKILL.md; do
  raw=$(grep -m1 '^description:' "$f" | sed -E 's/^description:[ ]*//')
  case "$raw" in
    \'*|\"*) ;;
    *) if printf '%s' "$raw" | grep -q ': '; then
         echo "FAIL $f: unquoted description contains ': ' (breaks YAML; wrap it in single quotes)"; status=1
       fi ;;
  esac
  d=$(awk '
    /^---$/ { fm++; next }
    fm == 1 && /^description:/ { on = 1; sub(/^description:[ ]*/, ""); print; next }
    fm == 1 && on && /^[a-z-]+:/ { exit }
    fm == 1 && on { print }
    fm == 2 { exit }
  ' "$f" | tr '\n' ' ' | sed -E "s/^[ ]*['\"]?//; s/['\"]?[ ]*$//")
  n=$(printf '%s' "$d" | wc -m)
  if [ "$n" -gt "$hard" ]; then echo "FAIL $f: description is $n chars (max $hard)"; status=1
  elif [ "$n" -gt "$soft" ]; then echo "warn $f: description is $n chars (target under $soft)"; fi
done
exit $status
