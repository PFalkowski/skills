# Allowlist

Comments that are exempt from [no-comment](SKILL.md). Everything not listed here still has to earn
its place by failing the rename / extract / encode test first.

A project extends this list in its own `CLAUDE.md` or contributing guide. Treat a project's
additions as authoritative over this file.

## Structural markers in tests

`// Arrange`, `// Act`, `// Assert` — and the equivalent Given/When/Then. These mark phases rather
than restate code, and they survive refactors of the test body.

## Hack and hotfix rationale

Why the non-obvious thing was necessary. Carry a ticket id where one exists, so the comment has an
expiry condition rather than living forever.

```cs
// HOTFIX PROJ-4821: upstream returns 200 with an empty body during failover.
// Treat empty as retryable until they ship the 503 fix.
```

## Required by convention or tooling

- License and copyright headers
- Doc comments on public APIs (`///`, JSDoc, docstrings) where the project publishes them
- Lint, compiler, or analyser suppressions — which must carry the reason, never bare:
  `// ReSharper disable once ...` alone is not enough

## Non-obvious external constraints

Facts a reader cannot recover from the code or its types: protocol quirks, byte-order requirements,
undocumented third-party behaviour, a spec clause the code deliberately violates. Cite the source.

## Deliberate omissions

Not exempt, and asked about often:

- **TODO / FIXME** — file a ticket. A TODO is a comment that has given up.
- **Section banners** (`// ---- helpers ----`) — the file needs splitting instead.
- **Changelog or authorship notes** — git holds these.
- **Commented-out code** — always delete.
