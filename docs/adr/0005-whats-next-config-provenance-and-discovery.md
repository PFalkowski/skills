# ADR-0005: whats-next's config provenance values and discovery fingerprint lifecycle

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

The PRD (issue #200) requires every setting in `config.json` to carry an origin tag, every
discovery candidate to be offered at most once per stable fingerprint, and a per-repository
discovery record so a decline in one repository never silently declines the same tracker in
another (user stories 3, 5, 6, 7). It does not spell out the origin values themselves, what
"the fingerprint changed" means in practice, how a decline is keyed, or what happens to a
config file written by an older version of the tool.

## Decision

**Origin values.** Exactly three: `discovered` (found by the discovery order in the PRD's
Implementation Decisions — remotes, documented links, key-naming habits, forge projects,
installed CLIs or MCP servers — and offered to the developer, who accepted it as-is);
`confirmed` (a discovered candidate the developer accepted after changing something about it,
for example correcting a project key); `hand-entered` (typed into configuration directly, with
no discovery candidate behind it, including a value from a committed-repo suggestion the
developer explicitly confirmed once per host per the PRD's "Repository-to-board mapping" and
"Security" sections).

**Fingerprint.** A candidate's fingerprint is a stable hash of its *identity*, not of the
answer given to it: tracker type plus its normalized address (repository slug and project key
for a forge source; base URL and project key for Jira or Azure DevOps; project path for
GitLab). Reordering discovery, re-running it, or restarting the tool never changes a
fingerprint and so never re-asks. A fingerprint changes only when the identity itself changes
— the project key is corrected, the tracker's base URL moves — and a changed fingerprint is
treated as a new candidate, offered once like any other.

**Decline keying.** A discovery record is keyed by `(repository slug, fingerprint)`, stored
under that repository's own record (see [ADR-0002](0002-whats-next-state-root-exception.md),
`repos/<repo-slug>/discovery.json`). Declining a source's fingerprint in one repository writes
only that repository's record; a second repository that surfaces the identical fingerprint is
offered it independently, matching PRD user story 7 exactly.

**Schema upgrade.** `config.json` and each repository's `discovery.json` carry a
`schemaVersion` integer. On load, a file at an older version is upgraded in memory to the
current shape (new fields default to their documented value; nothing existing is discarded)
and rewritten at the current `schemaVersion` on the next successful save. A field the current
version does not recognize is preserved unread rather than dropped, so a rollback to an older
build of the tool does not lose data written by a newer one. A file at a *newer* schema version
than the running tool understands is treated as read-only for that run — the tool reports it
plainly and proceeds with whatever it can parse, rather than overwriting a newer file with an
older shape.

## Consequences

- Origin is a closed, three-value enum; a fourth origin should not be added without revisiting
  this ADR, since every acceptance criterion in the PRD's Slice 1 testing section is written
  against exactly these three.
- The fingerprint's dependence on normalized identity, not raw input, means two differently
  spelled remotes that resolve to the same repository (`git@` vs `https://` forms of the same
  GitHub remote) must normalize to the same fingerprint; this is a testable property of the
  normalization function, not an incidental detail.

## Alternatives considered

- **Fingerprint the raw discovered string.** Rejected: two spellings of the same remote would
  be treated as two different candidates and both would be offered, which the PRD's "never
  asked again" guarantee (user story 5) explicitly rules out.
- **A global decline list, not per repository.** Rejected outright by the PRD itself (user
  story 7); recorded here only to rule it out explicitly for the implementation plan.
