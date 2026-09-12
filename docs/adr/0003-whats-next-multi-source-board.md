# ADR-0003: whats-next multi-source board — language, matching, ordering, config, and serve

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised).
  Corrected same day after a manager verdict on the first grill pass found several decisions
  drifted from the design the user had already agreed, and two reference formats unverified;
  this version supersedes the original ADR-0003 (launcher), ADR-0004 (matching and ordering),
  ADR-0005 (config provenance and discovery), and ADR-0006 (`wip serve`), which are deleted.

## Context

The PRD (issue #200) commits `whats-next`'s C# rewrite to: no prebuilt binaries (a launcher
builds from source and caches the result); deterministic, strict-key ticket matching, never
loose text similarity; manual order beating urgency; every config value carrying an origin tag
with each discovery candidate offered at most once; and a drag-and-drop server that binds
loopback only, behind a secret header and a `Host` check. It leaves the specifics of each open.
These are one feature and are settled together here.

## Decision

### Language and launcher

C# on .NET 10. The launcher hashes the project's `*.cs`/`*.csproj` files (sorted, concatenated,
SHA-256) and compares the result to a `source.sha256` marker written after the last successful
build; a missing cache, missing/mismatched marker, or an unfinished build forces a rebuild, a
match runs the cached binary straight away. A content hash is used, not a timestamp or a git
commit, because it stays correct across a checkout, a worktree, or a plain copy. Missing the
.NET 10 SDK (`dotnet --list-sdks` has no `10.` entry) prints one plain-English line naming the
requirement and an install link, then exits non-zero — no build attempt, no stack trace. The
cached binary and its marker live at `~/.agent-state/whats-next/bin/` ([ADR-0002](0002-whats-next-state-root-exception.md)),
not inside the checkout, so the cache survives the checkout being updated or removed. The
profile snippet keeps its shape (`function wip { <launcher> @args }`); every existing flag
(`-Html`, `-h`, `<n>`, `prune`, `-Apply`, `-Fetch`, `-IncludeIgnored`) passes through unchanged.

### Matching

A ticket key matches `[A-Z][A-Z0-9]{0,9}-[0-9]+` as a whole token (word boundary on both
sides) **only when its prefix is a project key already known from a configured source** for
that repository — never as a global pattern. A global version of the same pattern also matches
non-ticket tokens such as `UTF-8`, `SHA-256`, `ISO-8601`, `CVE-2024-1234`, `HTTP-2`, or
`ADR-0001`; scoping it to prefixes the developer has actually configured rules those out
without narrowing the pattern itself.

Per-tracker reference forms, each scoped to the repository's own configured source, never a
bare number, and never `PROJECT-123` for a tracker that does not use that shape:

- **GitHub:** `#123`, an issue/PR URL, a branch-name token `issue-123` or `gh-123` (a `#`
  cannot appear in a branch name, and `issue-N` branches are a common convention), a closing
  keyword (`fixes`/`closes`/`resolves #123`), or GitHub's own `closingIssuesReferences`/
  `linkedBranches` API links.
- **Azure DevOps:** work item IDs are numeric, referenced as `AB#123` in a commit message or
  pull-request description (the GitHub–Azure Boards integration) or `#123` in a native Azure
  Repos commit message. Confirmed against Microsoft Learn: ["Link GitHub commits, PRs,
  branches, and issues to work
  items"](https://learn.microsoft.com/en-us/azure/devops/boards/github/link-to-from-github?view=azure-devops)
  (`AB#{ID}` in a commit message, PR description, or issue description) and ["Drive Git
  development from work
  items"](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/connect-work-items-to-git-dev-ops?view=azure-devops)
  (`#ID` mention in a native Azure Repos commit message).
- **GitLab:** issues as `#123` in the same project or `group/project#123` cross-project;
  merge requests as `!123`. Confirmed against
  [docs.gitlab.com, "Crosslinking issues"](https://docs.gitlab.com/user/project/issues/crosslinking_issues/):
  issue and merge-request references are numeric, never a project-key-prefixed string.
- **Jira:** the `[A-Z][A-Z0-9]{0,9}-[0-9]+` pattern above, scoped to a known Jira project key.

Matching uses union-find grouping: every signal (a key in a branch name, a commit, a PR title
or body) is one edge; all signals landing on the same ticket or the same branch/PR collapse
into one row. A row spanning more than one linked key lists every key, links to each, and shows
the single hottest state among them — never silently drops one.

### Ordering

Manual order beats urgency, one list per group. A **new item** is inserted just before the
first already-placed item in its group's list whose own urgency rank is worse than the new
item's; if no placed item ranks worse, the new item goes at the end. It is never simply
appended and never inserted purely by urgency ahead of a manually-repositioned item: since a
new item carries no manual position of its own yet, this overrides no existing manual choice,
while a newly urgent item is not buried under items that are actually less urgent.

An item that leaves scope (closed, parked, unreachable) keeps its list position while absent,
so it reappears at that position if it returns; absent from every pull for more than 30 days,
it is dropped from the list the next time the list is rewritten.

A group's order among other groups is unchanged from today's board: its own single hottest
item, not alphabetical, not item count. Manual order only ever governs position *within* a
group.

### Config provenance and discovery

Three origin values: `discovered` (offered by the PRD's discovery order — remotes, documented
links, key-naming habits, forge projects, installed CLIs or MCP servers — accepted as-is);
`confirmed` (a discovered candidate accepted after changing something about it, for example a
corrected project key); `hand-entered` (typed directly, with no discovery candidate behind it,
including a value from a committed-repo suggestion confirmed once per host).

Two fingerprints, with two different jobs:

- **Identity fingerprint** (per candidate) — a stable hash of a candidate's normalized identity
  (tracker type plus its address: repo slug and project key for a forge source; base URL and
  project key for Jira or Azure DevOps; project path for GitLab), never the raw discovered
  string and never the answer given. It decides whether one specific candidate was already
  offered; it changes only when the identity itself changes (the project key is corrected, the
  base URL moves), never on a mere re-run or reorder of discovery. Declines are keyed by
  `(repository slug, fingerprint)`, stored in that repository's own
  `repos/<repo-slug>/discovery.json` ([ADR-0002](0002-whats-next-state-root-exception.md)), so
  a decline in one repository never silently declines the same source in another.
- **Input fingerprint** (per repository, per run) — a hash of the discovery inputs themselves:
  remote URLs, hashes of the scanned doc files, configured MCP servers, authenticated CLIs, and
  the discovery algorithm's own version. It decides whether discovery runs at all on a given
  invocation — a step such as `claude mcp list` can take many seconds — and discovery is
  skipped whenever the input fingerprint is unchanged since the last run.

`config.json` and each repository's `discovery.json` carry a `schemaVersion` integer. A file at
an older version is upgraded in memory (new fields take their documented default; nothing
existing is discarded) and rewritten at the current version on the next successful save; a
field the current version does not recognize is preserved unread, not dropped. A file at a
*newer* version than the running tool understands is treated as read-only for that run.

### `wip serve` lifetime, port, and security

Runs for one board view, not as a daemon: starts from the HTML report's reorder affordance or a
direct `wip serve`, and stops on a ten-minute idle timeout or the launching process exiting,
whichever comes first. **Idle** is measured from the served page's own last heartbeat ping, not
from HTTP request volume, so an open board a developer is reading but not clicking on stays
alive; the idle timer starts only once the last open page's heartbeat stops (its tab closed),
and the server exits once ten minutes pass with no further heartbeat.

Binds `127.0.0.1`/`::1` on an OS-assigned ephemeral port (port `0`) and prints the resulting
URL, carrying the launch secret as a query parameter for the first page load and thereafter
required as a custom request header on every call — never a cookie, so an unrelated page open
in the same browser cannot ride the session. Every request must also pass a `Host` header
check (`localhost` or `127.0.0.1`/`::1` at the bound port, which closes off DNS rebinding);
either check failing gets a generic refusal with no board content in the response, before any
board data is served. When the server is not running, the report's reorder control falls back
to copyable `wip move` text, the same pattern the report already uses for `wip://` where the
protocol is unregistered.

### Failure display

Each source shows an "as of `<time>`" stamp taken from its own last successful pull. A source
with any earlier successful pull keeps showing those cached tickets even when the latest
refresh attempt fails, with a "refresh failed, data from `<time>`" marker; the no-tickets
failure banner is shown only when a source has never once succeeded. Source freshness is its
own concern, governed by a refresh TTL (time to live) of 15 minutes since the last successful
pull — distinct from, and never reusing, `-StaleDays` (the existing 7-day commit-age threshold
used elsewhere on the board for unrelated git staleness). Past the TTL, the next `wip`
invocation attempts a refresh but keeps showing the cached tickets immediately, replacing them
only once the refresh succeeds. "Empty" remains a successful pull that found zero matching
tickets.

## Consequences

- Scoping ticket-key matching to configured project prefixes means an unconfigured tracker's
  keys never falsely match, at the cost of needing at least one confirmed or discovered source
  before any prefixed key matches at all.
- The two-fingerprint discovery design stores one extra value per repository (the input
  fingerprint), in exchange for not re-running slow CLI/MCP probes on every invocation.
- A heartbeat-based idle timer needs the served page's script to keep running while open; a
  page that loses it (network loss, browser kill) is indistinguishable from a closed tab and
  times out the same way — an accepted simplification.
- The 15-minute refresh TTL and the 30-day order-retention window are defaults, not
  user-facing settings in slice 4; either can become configurable later without changing
  `config.json`'s or `prefs.json`'s shape.
- A source change with no behavioral effect (a comment, a round-tripping rename) still
  triggers a launcher rebuild, because the hash is content-based, not semantic — the accepted
  cost of correctness over a false cache hit.

## Alternatives considered

- **A global key pattern with no prefix scoping.** Rejected: it matches non-ticket tokens
  (`UTF-8`, `SHA-256`, `CVE-2024-1234`, `ADR-0001`, and others), which strict deterministic
  matching exists specifically to avoid.
- **`PROJECT-123` for Azure DevOps and GitLab references.** Rejected: neither product uses
  that shape (Azure DevOps work items are numeric, GitLab issues and merge requests are
  numeric); using the wrong shape would silently match nothing.
- **Appending a new item to the end of its group.** Rejected: it buries a newly urgent item
  under the whole queue, the one case where "manual order always wins" would help least.
- **Dropping an out-of-scope item's order position immediately.** Rejected: it defeats a
  manually curated position for anything that leaves and returns within normal work cadence.
- **One fingerprint for both "run discovery" and "was this candidate offered."** Rejected: the
  identity fingerprint must survive a re-run or reorder so a decline is never re-asked, while
  the run-gate must change whenever any input changes — the two lifetimes conflict in one
  field.
- **Idle timeout measured from HTTP request volume.** Rejected: a developer reading an open
  board without clicking would be timed out mid-use.
- **Reusing `-StaleDays` for source data age.** Rejected: it is a 7-day commit-age threshold
  for a different signal; a tracker refresh needs a much shorter TTL.
- **A fixed, documented port for `wip serve`, or a long-running background instance.**
  Rejected: collision risk on a shared or busy machine, and a listener that outlives the
  developer's use of it, for a feature the PRD frames as opt-in and occasional.
