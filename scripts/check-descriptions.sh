#!/usr/bin/env bash
# Fails on a SKILL.md description over 1024 characters, naming its own slash command, or with an unquoted ": "; warns above 320. Prints the total cost.
set -u
cd "$(dirname "$0")/.."
hard=1024 soft=320 status=0 total=0
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
  skill=${f%/SKILL.md}
  if printf '%s' "$d" | grep -qE "(^|[^A-Za-z0-9_-])/$skill([^A-Za-z0-9_-]|$)"; then
    echo "FAIL $f: description names its own slash command /$skill (implied by the skill name)"; status=1
  fi
  n=$(printf '%s' "$d" | wc -m)
  total=$((total + n))
  if [ "$n" -gt "$hard" ]; then echo "FAIL $f: description is $n chars (max $hard)"; status=1
  elif [ "$n" -gt "$soft" ]; then echo "warn $f: description is $n chars (target under $soft)"; fi
done
echo "total: $total chars across all descriptions (~$((total / 4)) tokens loaded every turn)"
exit $status
