#!/usr/bin/env bash
# Fails when a skill's markdown declares a state root that is neither
# ~/.agent-state/<repo-slug>/<skill>/... nor its in-tree opt-in
# .agent-state/<skill>/... and is not a permanent deliverable exemption below;
# when a skill declares a bare file directly under the state root with no
# <skill>/ segment; or when it names a state path this repo has already
# migrated away from. It never flags .agents/skills/, which belongs to OpenAI
# Codex -- committed team skills, with $HOME/.agents/skills for personal ones.
# See docs/agent-state.md and docs/adr/0001-agent-state-location.md for the
# convention this enforces.
set -euo pipefail
cd "$(dirname "$0")/.."
cd "${CHECK_STATE_PATHS_ROOT:-.}"

# Permanent exemptions for the generic scan below, not migration TODOs. Each
# is a deliverable under docs/agent-state.md's logs-vs-deliverables test -- a
# human is expected to read it later without knowing a run happened -- so it
# keeps its own human-facing home and never moves under the state root.
#
#   .out-of-scope/  -- triage's record of rejected requests
#   .nights-watch/  -- only its tracked library/. The nights-watch pass below
#                      is what holds that line: exempting the directory as a
#                      whole here would let any other subpath of it through.
deliverable_re='\.nights-watch/|\.out-of-scope/'

# Harness, VCS, or sub-path references -- never a skill's own state root.
infra_re='\.claude-plugin/|\.claude/|\.githooks/|\.github/|\.git/|\.ssh/|\.lock/|\.agents/'

state_root_re='\.agent-state/'

# Only library/ under .nights-watch/ is a deliverable. Everything else there
# is run state that has migrated, so this pass names the whole rest of the
# directory rather than a list of the four subpaths that exist today -- a
# list would let a newly invented .nights-watch/reports/ land green.
nights_watch_allowed_seg='library'

# Other state paths this repo has migrated away from; they must not come
# back. The generic scan cannot see these: a non-dot path such as
# docs/sdlc/runs/ never matches its dot-directory pattern, and a dot-root
# that someone re-adds to deliverable_re would otherwise be silently
# re-permitted. Each entry is "<pattern>;<where the state went instead>".
#
# These patterns are matched anywhere in the line, deliberately unanchored:
# a retired path is just as wrong written as ~/.nights-watch/x, <repo>/x or
# ./x as it is bare, and those qualified spellings are the ones these skills
# actually use.
retired_res=(
  'docs/sdlc/runs/;~/.agent-state/<repo-slug>/sdlc-old-fashioned/runs/'
  'prompts/sdlc-backlog\.md;~/.agent-state/<repo-slug>/<owning skill>/backlog.md -- see docs/agent-state.md, Retired paths'
  '\.housekeeping/;~/.agent-state/<repo-slug>/housekeeping/'
  '\.recurring-improvement/;docs/recurring-backlog.md'
  '\.sdlc/;~/.agent-state/<repo-slug>/sdlc-workhorse/'
  '\.agents/[A-Za-z0-9_.<>/-]+;~/.agent-state/<repo-slug>/<slug>/'
)

codex_skills_re='\.agents/skills(/|$)'

offenders=0
report() {
  echo "NONCONFORMING $1:$2 -> ${3# } ($4)"
  offenders=1
}

for dir in */; do
  skill="${dir%/}"
  [ -f "${dir}SKILL.md" ] || continue

  # A dot-prefixed directory that is neither the state root nor infra nor a
  # deliverable. The exemptions are tested against the matched text, never the
  # whole path:line:match record -- filtering the record would exempt every
  # file whose own path happened to contain an exempt segment.
  while IFS=: read -r f l match; do
    printf '%s' "$match" | grep -qE "$deliverable_re" && continue
    printf '%s' "$match" | grep -qE "$infra_re" && continue
    printf '%s' "$match" | grep -qE "$state_root_re" && continue
    report "$f" "$l" "$match" "skill state belongs at ~/.agent-state/<repo-slug>/$skill/..."
  done < <(grep -rnoE '(^|[^A-Za-z0-9_/.~-])\.[a-z][a-z0-9-]*/' --include='*.md' "$dir" || true)

  # A bare file directly under the state root (no <slug>/ segment) is not
  # conforming (docs/agent-state.md, "The directory rule"). The generic scan
  # exempts the bare .agent-state/ spelling by name, and never sees the
  # qualified ~/.agent-state/ or <repo>/.agent-state/ ones at all, since the
  # character class in front of its pattern excludes "~" and "/". So it can
  # never tell a bare file from the conforming .agent-state/<slug>/... shape.
  # This pass captures the segment right after .agent-state/ and checks
  # whether a "/" follows it.
  while IFS=: read -r f l match; do
    report "$f" "$l" "$match" "bare file directly under .agent-state/, no skill segment -- see docs/agent-state.md"
  done < <(grep -rnoE '\.agent-state/[A-Za-z0-9_.-]+/?' --include='*.md' "$dir" \
             | grep -vE '/$' || true)

  # Any subpath of .nights-watch/ except the tracked library/.
  # The segment charset is deliberately "anything but whitespace and the
  # characters that close a markdown span", not [A-Za-z0-9_.-]: the paths
  # these files actually write are templated, and a narrow class simply
  # fails to match .nights-watch/<repo-slug>/hunts/ at all rather than
  # flagging it. A bare .nights-watch/ naming no subpath is left alone --
  # it claims no state root, and the Library's own layout block uses it.
  while IFS=: read -r f l match; do
    seg="${match##*.nights-watch/}"
    seg="${seg%%/*}"
    [ -z "$seg" ] && continue
    [ "$seg" = "$nights_watch_allowed_seg" ] && continue
    report "$f" "$l" "$match" "nights-watch run state moved to ~/.agent-state/<repo-slug>/nights-watch/; only library/ stays"
  done < <(grep -rnoE '\.nights-watch/[^[:space:])"`'"'"']*' --include='*.md' "$dir" || true)

  for entry in "${retired_res[@]}"; do
    pattern="${entry%%;*}"
    moved_to="${entry#*;}"
    while IFS=: read -r f l match; do
      printf '%s' "$match" | grep -qE "$codex_skills_re" && continue
      report "$f" "$l" "$match" "retired state path; it moved to $moved_to"
    done < <(grep -rnoE "$pattern" --include='*.md' "$dir" || true)
  done
done

exit "$offenders"
