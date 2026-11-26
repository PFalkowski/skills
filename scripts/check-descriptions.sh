#!/usr/bin/env bash
# Fails on a SKILL.md description or a workflows/*.js meta.description over 120 characters, naming its own slash command, or with an unquoted ": "; warns above 100.
# Prints the cost split by whether the description is actually in context: disable-model-invocation excludes it entirely.
# A workflow's meta.description or meta.whenToUse that is not one quoted string on its own line also fails, since it cannot be measured.
set -u
cd "$(dirname "$0")/.."
hard=120 soft=100 status=0 total=0 loaded=0
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
  # a skill the model cannot invoke has its description withheld from the prompt, so it costs nothing per turn
  if awk '/^---$/{n++; next} n==1' "$f" | grep -q '^disable-model-invocation:[[:space:]]*true'; then :; else loaded=$((loaded + n)); fi
  if [ "$n" -gt "$hard" ]; then echo "FAIL $f: description is $n chars (max $hard)"; status=1
  elif [ "$n" -gt "$soft" ]; then echo "warn $f: description is $n chars (target under $soft)"; fi
done
# A workflow script's meta.description is listed to the model beside the skills', so it has the same limit.
# Its meta.whenToUse is appended to that text, so it counts in the totals but has no limit of its own.
# Each field must be one quoted string on its own line; any other shape cannot be measured and fails.
meta_field() {
  local line q text
  line=$(grep -E "^  $2:" <<<"$1" | head -n 1)
  text=$(sed -nE "s/^  $2:[[:space:]]*(['\"\`])(.*)\1,?[[:space:]]*\$/\2/p" <<<"$line")
  q=$(sed -nE "s/^  $2:[[:space:]]*(['\"\`]).*/\1/p" <<<"$line")
  case "$text" in *"$q"*) return ;; esac
  printf '%s\n' "$text"
}
for f in workflows/*.js; do
  [ -f "$f" ] || continue
  meta=$(awk '/^export const meta = \{/ { on = 1; print; if (/\}/) exit; next } on { print } on && /^\}/ { exit }' "$f")
  for field in description whenToUse; do
    if ! grep -qE "^  $field:" <<<"$meta"; then
      [ "$field" = description ] && { echo "FAIL $f: no meta.description line (put each meta field on its own line)"; status=1; }
      continue
    fi
    if [ "$(grep -cE "^  $field:" <<<"$meta")" -gt 1 ]; then
      echo "FAIL $f: meta has more than one $field line"; status=1
      continue
    fi
    text=$(meta_field "$meta" "$field")
    n=$(printf '%s' "$text" | wc -m)
    if [ "$n" -eq 0 ]; then
      echo "FAIL $f: meta.$field is empty or is not one quoted string on one line (a concatenation, a value on the next line or a quote character inside the string cannot be measured)"; status=1
      continue
    fi
    total=$((total + n)); loaded=$((loaded + n))
    [ "$field" = description ] || continue
    if [ "$n" -gt "$hard" ]; then echo "FAIL $f: meta.description is $n chars (max $hard)"; status=1
    elif [ "$n" -gt "$soft" ]; then echo "warn $f: meta.description is $n chars (target under $soft)"; fi
  done
done
echo "automatic descriptions (Claude invocation policy): $loaded chars"
echo "withheld by disable-model-invocation: $((total - loaded)) chars"
echo "total across all descriptions: $total chars"
echo "Token cost and invocation-policy support depend on the host and tokenizer."
exit $status
