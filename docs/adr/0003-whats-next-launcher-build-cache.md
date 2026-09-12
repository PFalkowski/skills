# ADR-0003: whats-next's launcher builds from source and caches by source hash

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

The PRD (issue #200, Implementation Decisions, "Language constraint") requires the C# rewrite
to publish no prebuilt binaries: a small launcher builds the tool from source on first run and
reuses the cached build afterward (user story 30). Three questions were left open for this
phase: how the launcher tells a cached build is stale, what happens on a machine without the
.NET 10 SDK, and where the cached binary lives.

## Decision

**Staleness check.** The launcher hashes the whats-next C# project's source files (every
`*.cs` and `*.csproj` under the project, sorted, concatenated, hashed with SHA-256) and
compares it to a `source.sha256` file written next to the cached build at the end of a
successful build. A missing cache, a missing or mismatched hash file, or a build that never
finished all force a rebuild; a matching hash skips straight to running the cached binary. A
content hash is used instead of a git commit or a file-modified-time check because it is
correct whether the source came from a checkout, a worktree, or a plain copy, and because a
modified-time check breaks the moment a checkout is re-cloned or its timestamps are touched by
an unrelated tool.

**Missing SDK.** The launcher checks for a .NET 10 SDK (`dotnet --list-sdks` reporting a
`10.` entry) before attempting a build. When it is absent, the launcher prints one plain-English
line naming the requirement and a link to the official install page, then exits non-zero
without attempting a build and without a stack trace. This is the same "clear message, no
crash" bar the PRD sets for non-interactive runs generally (Implementation Decisions,
"Non-interactive behavior").

**Cache location.** The built binary and its `source.sha256` marker live at
`~/.agent-state/whats-next/bin/` — inside the machine-wide state root this tool uses for
every other piece of its own state (see [ADR-0002](0002-whats-next-state-root-exception.md)),
not inside the skill's own directory in the repository checkout, which would make the cache
part of the tracked tree and would break the moment the checkout is updated or removed.

**Profile one-liner.** `SKILL.md`'s quick-start and profile snippet change from invoking
`wip.ps1` (which today runs the PowerShell implementation directly) to invoking a thin
launcher script of the same name and calling convention — `wip { <launcher> @args }` — so a
developer who already wired the old snippet into their profile needs no new step beyond
re-running the one-time setup instructions once, and every existing flag (`-Html`, `-h`,
`<n>`, `prune`, `-Apply`, `-Fetch`, `-IncludeIgnored`) passes through unchanged to the built
binary.

## Consequences

- A source change with no behavioral effect (a comment, a rename that round-trips) still
  triggers a rebuild, because the hash is content-based, not semantic. This is the accepted
  cost of correctness over the false-cache-hit risk of a cheaper check.
- The build step needs a working C# toolchain on first run; this is the explicit trade this
  PRD already makes by ruling out prebuilt binaries.

## Alternatives considered

- **A version file bumped by hand.** Rejected: it depends on a human remembering to bump it,
  which defeats the goal of the cache being invisible when correct.
- **Rebuild on every run.** Rejected: it reintroduces the build-step latency the cache exists
  to remove, on every single invocation of a tool meant to be run constantly.
