#!/usr/bin/env bash
# Fails when a skill's markdown declares a state root that is not
# .agents/<skill>/... and is not on the grandfather allowlist below.
# See docs/agent-state.md for the convention this enforces.
set -euo pipefail
cd "$(dirname "$0")/.."
cd "${CHECK_STATE_PATHS_ROOT:-.}"

# Grandfathered state roots -- migration TODOs from before this convention,
# not permanent exemptions. Delete a line here as its skill migrates to
# .agents/<skill>/... (with the old path still read for at least one release,
# per docs/agent-state.md). Migration itself is separate follow-up work.
#
# Matched by the detector below (dot-prefixed directories):
#   .nights-watch/            -- tracked layout already split in #145; migration is its own follow-up issue
#   .housekeeping/
#   .recurring-improvement/
#   .out-of-scope/
# Not matched by the detector (non-dot paths; recorded here for the same
# migration inventory even though this script's pattern won't catch them --
# a bare-word match on "prompts/" or "backlog.md" would be too noisy):
#   docs/sdlc/runs/
#   prompts/
#   backlog.md
#   LESSONS-LEARNED.md
#   docs/recurring-backlog.md
grandfather_re='\.nights-watch/|\.housekeeping/|\.recurring-improvement/|\.out-of-scope/'

# Harness, VCS, or sub-path references -- never a skill's own state root.
infra_re='\.claude-plugin/|\.claude/|\.githooks/|\.github/|\.git/|\.ssh/|\.lock/|\.agents/'

offenders=0
for dir in */; do
  skill="${dir%/}"
  [ -f "${dir}SKILL.md" ] || continue
  while IFS=: read -r f l match; do
    echo "NONCONFORMING $f:$l -> ${match# } (skill state belongs at .agents/$skill/...)"
    offenders=1
  done < <(grep -rnoE '(^|[^A-Za-z0-9_/.~-])\.[a-z][a-z0-9-]*/' --include='*.md' "$dir" \
             | grep -vE "$grandfather_re" \
             | grep -vE "$infra_re" || true)
done

exit "$offenders"
