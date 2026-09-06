---
name: ci-hardcodes-the-clean-room-test-path
description: Resolved — checks.yml once named a test file literally inside set -e; the rename it broke is why that list is globs now
type: gotcha
---

**Status: fixed on `main`.** Kept because the failure is worth recognising the next time someone
adds a path to this workflow, not because the hazard is still live.

`.github/workflows/checks.yml` used to iterate:

```sh
for t in .claude/workflows/*.test.js archive/clean-room/screen-brief.test.mjs; do
  node --test "$t"
done
```

The first item is a glob and survives a rename. The second was a **literal path**, inside a
`set -e` block. So moving `archive/clean-room/` without editing the workflow in the same commit
handed `node --test` a path that no longer existed.

## It actually fired

PR #143 promoted `clean-room` out of `archive/` and did not touch the workflow. CI went red with:

```
Could not find 'archive/clean-room/screen-brief.test.mjs'
##[error]Process completed with exit code 1.
```

The error names a missing file and says nothing about the rename that removed it, which is the
part that costs time — it reads like infrastructure trouble. Filed as #146; fixed in #143 by
replacing the literal with a glob. `main` now reads:

```sh
for t in .claude/workflows/*.test.js clean-room/*.test.mjs; do
```

## The durable lesson

A literal path in a `set -e` loop is a tripwire for anything that moves files: a glob over the
directory degrades gracefully, a named file does not. And note the fix is narrower than it looks —
`clean-room/*.test.mjs` still encodes that directory, so renaming the directory itself would
reintroduce the same failure. If a third test path is ever added here, prefer discovery over
naming.

Retrieving this workflow from a ref needs `MSYS_NO_PATHCONV=1` — see
[[msys-path-conversion-mangles-git-rev-paths]]. See also [[repo-ci-check-surface]].
