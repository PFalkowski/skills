#!/usr/bin/env bash
# Fails when a skill's markdown declares a state root that is not
# .agents/<skill>/... and is not on the grandfather allowlist below; when a
# skill declares a bare file directly under .agents/ with no <slug>/
# segment; or when the repo's .gitignore is missing the wholesale .agents/
# line docs/agent-state.md's gitignore rule claims exists.
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

# A bare file directly under .agents/ (no <slug>/ segment) is not
# conforming (docs/agent-state.md, "The directory rule"). The generic
# detector above treats .agents/ as infra -- it only ever sees the short
# ".agents/" token, never what follows it -- so it can never tell a bare
# file from the conforming .agents/<slug>/... shape. This is a separate
# pass that captures the segment right after .agents/ and checks whether
# a "/" follows it (nested under a slug: conforming) or not (bare: not).
#
# recurring-improvement/SKILL.md's `.agents/recurring-backlog.md` is a
# named migration item (#159), not a fresh violation for this check to
# raise -- grandfathered here the same way the dot-directories above are.
bare_agents_grandfather_re='\.agents/recurring-backlog\.md'

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
  while IFS=: read -r f l match; do
    echo "NONCONFORMING $f:$l -> ${match# } (bare file directly under .agents/, no skill segment -- see docs/agent-state.md)"
    offenders=1
  done < <(grep -rnoE '\.agents/[A-Za-z0-9_.-]+/?' --include='*.md' "$dir" \
             | grep -vE '/$' \
             | grep -vE "$bare_agents_grandfather_re" || true)
done

# The gitignore rule: docs/agent-state.md claims .agents/ is ignored
# wholesale by a single ".agents/" line in the managed repo's .gitignore.
# Check that the line is actually there, or the claim is false and someone
# will trust it and commit run logs.
if [ ! -f .gitignore ] || ! grep -qxE '\.agents/?' .gitignore; then
  echo "NONCONFORMING .gitignore -> missing a wholesale '.agents/' line (docs/agent-state.md's gitignore rule)"
  offenders=1
fi

exit "$offenders"
