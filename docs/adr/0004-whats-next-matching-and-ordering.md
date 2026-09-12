# ADR-0004: whats-next's ticket-key matching pattern and manual-order lifecycle

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

The PRD (issue #200) commits to deterministic, strict-key matching (never loose text
similarity) and to manual order beating urgency, but leaves the exact key pattern and three
edge cases of ordering unstated: where a new item lands, what happens to the order of an item
that leaves scope and returns, and how a group's own order is decided (the last one is already
answered elsewhere in the PRD — a group is ordered by its hottest item, unchanged from today's
board — and is included here only for completeness).

## Decision

**Key pattern.** A ticket key is a short, uppercase project prefix (one to ten letters or
digits, starting with a letter) followed by a hyphen and one or more digits — `[A-Z][A-Z0-9]{0,9}-[0-9]+`
— matched as a whole token (word boundary on both sides) in branch names, commit subjects, and
PR titles and bodies. This is the shape Jira, Azure DevOps Boards (when configured with a
project key), and GitLab issue references of the form `PROJECT-123` already use, and it is
deliberately strict enough to never match inside a commit hash, a version string, or a
CSS-style class name. GitHub Issues have no project-prefixed key; a GitHub ticket instead
matches the repository-scoped forms GitHub itself recognizes — a bare `#123` or an issue URL
— resolved only against the repository the branch, commit, or PR already belongs to, never
matched globally.

**Joining rows.** Matching uses a union-find grouping: every signal (a ticket key in a branch
name, in a commit, in a PR title or body) is one edge, and all signals that land on the same
ticket or the same branch/PR collapse into one row. When two tickets both resolve into one
component (for example, a duplicate ticket linked to the same PR in both trackers), the row
lists every linked key and a link to each, shows the single hottest state among them, and
never silently drops one.

**New item's position.** A newly discovered item is appended to the end of its group's manual
order list. It is never inserted by urgency, including on the very first appearance of a
newly hot item — the developer sees it at the bottom, ranked by urgency marker only, and moves
it if they want it earlier. This keeps the one rule ("manual order always wins") with no
first-run exception to remember.

**An item that leaves scope and returns.** The manual order list keeps an item's identifier
even while the item is not shown on the board (out of scope, closed, or unreachable), so that
if it becomes visible again it reappears at its previous position rather than the end. An
identifier that has been absent from every pull for more than 30 days is dropped from the
order list the next time the list is rewritten, so the list does not grow forever with
identifiers for tickets that will never return.

**Group order.** Unchanged from today's board: a group is ordered among other groups by its
own single hottest item, not alphabetically and not by item count (`SKILL.md`, "The ranking
ladder"). Manual order only ever governs position *within* a group.

## Consequences

- The 30-day retention window is a default, not a user-facing setting in slice 4; it can
  become configurable later if it proves wrong in practice, without changing the shape of
  `prefs.json`.
- A GitHub-only repository never risks a false match against another tracker's key pattern,
  because its own matching form is scoped to the repository rather than global.

## Alternatives considered

- **Insert a new item by its urgency rank instead of appending.** Rejected: it contradicts
  "manual order always wins" on the one case — first appearance — where it would matter most,
  since a newly hot item is exactly the kind of item urgency-based insertion is meant to favor.
- **Drop an out-of-scope item's order position immediately.** Rejected: it defeats the purpose
  of a manually curated position for anything that leaves and returns within normal work
  cadence (a ticket re-opened, a PR reopened after a failed merge).
