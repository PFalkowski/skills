---
name: ci-hardcodes-the-clean-room-test-path
description: "A literal path in checks.yml's set -e loop broke CI on a rename; fixed in 3b56c40 by switching to a glob"
type: gotcha
---

`.github/workflows/checks.yml` used to iterate
`.claude/workflows/*.test.js archive/clean-room/screen-brief.test.mjs`. The first is a glob; the
second was a literal path, and the whole step runs under `set -e`. Moving or renaming
`archive/clean-room/` without editing the workflow in the same commit would hand `node --test` a
path that does not exist and fail the job — reporting a missing file, which reads like
infrastructure trouble rather than the rename that caused it.

Verified at `origin/main` (`dfb4d27`) with:

```sh
MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/checks.yml"
```

This was live rather than hypothetical: a rename of all four `archive/clean-room/*` files to
`clean-room/*` was staged in the working index at the time this was written, and `checks.yml` had
not yet been updated to match:

```
R100  archive/clean-room/BRIEF-TEMPLATE.md      clean-room/BRIEF-TEMPLATE.md
R100  archive/clean-room/SKILL.md               clean-room/SKILL.md
R100  archive/clean-room/screen-brief.mjs       clean-room/screen-brief.mjs
R100  archive/clean-room/screen-brief.test.mjs  clean-room/screen-brief.test.mjs
```

Commit `3b56c40` (merge of PR #143) landed that rename and fixed the workflow line in the same
commit, replacing the literal path with `clean-room/*.test.mjs`. The lesson stands: a literal path
in a `set -e` loop breaks on a rename, where a glob would have degraded gracefully. See
[[repo-ci-check-surface]].
