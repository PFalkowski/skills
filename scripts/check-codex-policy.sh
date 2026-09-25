#!/usr/bin/env bash
# Fails when a SKILL.md's disable-model-invocation: true and its agents/openai.yaml allow_implicit_invocation: false disagree.
set -u
cd "$(dirname "$0")/.."
status=0
while IFS= read -r skill; do
  dir=$(dirname "$skill")
  manual=no; grep -qE '^disable-model-invocation:[[:space:]]*true[[:space:]]*$' "$skill" && manual=yes
  codex=no; grep -qE '^[[:space:]]+allow_implicit_invocation:[[:space:]]*false[[:space:]]*$' "$dir/agents/openai.yaml" 2>/dev/null && codex=yes
  if [ "$manual" != "$codex" ]; then
    echo "FAIL $dir: disable-model-invocation true=$manual but agents/openai.yaml allow_implicit_invocation false=$codex"
    status=1
  fi
done < <(find . -name SKILL.md -not -path './.git/*' -not -path '*/node_modules/*' | sort)
[ "$status" -eq 0 ] && echo "codex policy: every manual-only skill has allow_implicit_invocation: false, and no other skill does"
exit $status
