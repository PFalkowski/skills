#!/usr/bin/env bash
# Fails when a single-word backticked name in templates/*.md is neither a skill in .claude-plugin/plugin.json nor allowlisted.
set -u
cd "$(dirname "$0")/.."
allow="Workflow sdlc-workhorse pfalkowski-skills:"
known=" $(grep -oE '"\./[a-z0-9-]+"' .claude-plugin/plugin.json | tr -d '"./' | tr '\n' ' ') $allow "
status=0
for f in templates/*.md; do
  for name in $(grep -oE '`[A-Za-z][A-Za-z0-9:-]*`' "$f" | tr -d '`' | sort -u); do
    case "$known" in *" $name "*) ;; *) echo "FAIL $f: \`$name\` is not a skill in .claude-plugin/plugin.json"; status=1 ;; esac
  done
done
[ "$status" -eq 0 ] && echo "templates: every skill name resolves"
exit $status
