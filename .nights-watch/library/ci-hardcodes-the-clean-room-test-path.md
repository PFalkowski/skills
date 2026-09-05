---
name: ci-hardcodes-the-clean-room-test-path
description: Moving archive/clean-room/ breaks CI, because checks.yml names that test file literally
type: gotcha
---

`.github/workflows/checks.yml` iterates
`.claude/workflows/*.test.js archive/clean-room/screen-brief.test.mjs`. The first is a glob; the
second is a literal path, and the whole step runs under `set -e`. If `archive/clean-room/` is moved
or renamed without editing the workflow in the same commit, `node --test` is handed a path that
does not exist and the job fails — reporting a missing file, which reads like infrastructure
trouble rather than the rename that caused it.

Verified at `origin/main` (`dfb4d27`) with:

```sh
MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/checks.yml"
```

This is live rather than hypothetical. A rename of all four `archive/clean-room/*` files to
`clean-room/*` was staged in the working index at the time this was written, and `checks.yml` had
not been updated to match:

```
R100  archive/clean-room/BRIEF-TEMPLATE.md      clean-room/BRIEF-TEMPLATE.md
R100  archive/clean-room/SKILL.md               clean-room/SKILL.md
R100  archive/clean-room/screen-brief.mjs       clean-room/screen-brief.mjs
R100  archive/clean-room/screen-brief.test.mjs  clean-room/screen-brief.test.mjs
```

Anyone landing that rename must edit the workflow alongside it. See [[repo-ci-check-surface]].
