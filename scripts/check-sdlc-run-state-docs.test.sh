#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
S="$ROOT/sdlc-old-fashioned"
fail=0
need() { grep -qF -- "$2" "$1" || { echo "FAIL: $1 lacks: $2"; fail=1; }; }
refuse() { ! grep -qF -- "$2" "$1" || { echo "FAIL: $1 still has: $2"; fail=1; }; }
need "$S/SKILL.md" 'The date is the run'"'"'s start date. Record the chosen `<state>/` path in the PR description'
need "$S/SKILL.md" 'is not the recorded path of the run being resumed'
refuse "$S/SKILL.md" 'is not this run'"'"'s own resume'
need "$S/references/workflow-mode.md" "each slice's \`verifiedFindings\` (severity, rule, summary, evidence)"
refuse "$S/references/workflow-mode.md" 'verified findings with their verdicts'
need "$S/references/handover-protocol.md" 'not a deliverable. The state root sits outside the tree, so the backlog never reaches'
refuse "$S/references/handover-protocol.md" 'not a deliverable, the state root'
[ "$fail" -eq 0 ] && echo "all passed"
exit "$fail"
