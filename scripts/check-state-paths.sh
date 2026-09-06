#!/usr/bin/env bash
# Fails when a skill's markdown declares a state root that is not
# .agents/<skill>/... and is not a permanent deliverable exemption below; when
# a skill declares a bare file directly under .agents/ with no <slug>/
# segment; when it names a state path this repo has already migrated away
# from; or when the repo's .gitignore is missing the wholesale .agents/ line
# docs/agent-state.md's gitignore rule claims exists.
# See docs/agent-state.md for the convention this enforces.
set -euo pipefail
cd "$(dirname "$0")/.."
cd "${CHECK_STATE_PATHS_ROOT:-.}"

# Permanent exemptions, not migration TODOs. Each is a deliverable under
# docs/agent-state.md's logs-vs-deliverables test -- a human is expected to
# read it later without knowing a run happened -- so it keeps its own
# human-facing home and never moves under the wholesale-ignored .agents/.
#
#   .out-of-scope/  -- triage's record of rejected requests
#   .nights-watch/  -- only its tracked library/; every other subpath was run
#                      state and has migrated, which retired_res enforces
deliverable_re='\.nights-watch/|\.out-of-scope/'

# Harness, VCS, or sub-path references -- never a skill's own state root.
infra_re='\.claude-plugin/|\.claude/|\.githooks/|\.github/|\.git/|\.ssh/|\.lock/|\.agents/'

# State paths this repo has migrated away from; they must not come back. The
# generic detector cannot catch these. A non-dot path such as docs/sdlc/runs/
# never matches its dot-directory pattern, and .nights-watch/ is exempt as a
# whole because its library/ subpath is a deliverable, which would otherwise
# let the run-log subpaths beside it return unnoticed. Each entry is
# "<pattern>;<where the state went instead>".
retired_res=(
  '\.nights-watch/([Jj][Oo][Uu][Rr][Nn][Aa][Ll]\.md|chronicles/|locks/|hunts/);.agents/nights-watch/'
  'docs/sdlc/runs/;.agents/sdlc-old-fashioned/runs/'
  'prompts/sdlc-backlog\.md;.agents/sdlc-old-fashioned/backlog.md'
)

offenders=0
for dir in */; do
  skill="${dir%/}"
  [ -f "${dir}SKILL.md" ] || continue
  while IFS=: read -r f l match; do
    echo "NONCONFORMING $f:$l -> ${match# } (skill state belongs at .agents/$skill/...)"
    offenders=1
  done < <(grep -rnoE '(^|[^A-Za-z0-9_/.~-])\.[a-z][a-z0-9-]*/' --include='*.md' "$dir" \
             | grep -vE "$deliverable_re" \
             | grep -vE "$infra_re" || true)
  # A bare file directly under .agents/ (no <slug>/ segment) is not
  # conforming (docs/agent-state.md, "The directory rule"). The generic
  # detector treats .agents/ as infra -- it only ever sees the short
  # ".agents/" token, never what follows it -- so it can never tell a bare
  # file from the conforming .agents/<slug>/... shape. This pass captures the
  # segment right after .agents/ and checks whether a "/" follows it (nested
  # under a slug: conforming) or not (bare: not).
  while IFS=: read -r f l match; do
    echo "NONCONFORMING $f:$l -> ${match# } (bare file directly under .agents/, no skill segment -- see docs/agent-state.md)"
    offenders=1
  done < <(grep -rnoE '\.agents/[A-Za-z0-9_.-]+/?' --include='*.md' "$dir" \
             | grep -vE '/$' || true)
  for entry in "${retired_res[@]}"; do
    pattern="${entry%%;*}"
    moved_to="${entry##*;}"
    while IFS=: read -r f l match; do
      echo "NONCONFORMING $f:$l -> ${match# } (retired state path; it moved to $moved_to)"
      offenders=1
    done < <(grep -rnoE "(^|[^A-Za-z0-9_/.~-])($pattern)" --include='*.md' "$dir" || true)
  done
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
