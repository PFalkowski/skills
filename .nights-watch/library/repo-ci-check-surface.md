---
name: repo-ci-check-surface
description: What CI actually runs in this repo, and which of those checks can fail a build
type: convention
---

`.github/workflows/checks.yml` (on `push` and `pull_request`, ubuntu-latest, Node 22) runs a single
`set -e` block:

```sh
bash scripts/check-links.sh
bash scripts/check-descriptions.sh
bash dead-branch-guard/scripts/pre-push.test.sh
for t in .claude/workflows/*.test.js clean-room/*.test.mjs; do
  node --test "$t"
done
```

Two things a worker needs to know before calling a change verified:

- **`check-descriptions.sh` does fail the build**, on a description over 1024 chars, an unquoted
  `": "`, or a description naming its own slash command; it only warns (exit 0) for the 320-1024
  char band. Run against the tree at `dfb4d27` it exits 0 with warnings and no failures — read its
  output, not just its exit code.
- **The `node --test` line used to name one path literally.** Before commit `3b56c40`,
  `archive/clean-room/screen-brief.test.mjs` was hard-coded inside a `set -e` block while
  `.claude/workflows/*.test.js` was a glob that degrades gracefully; moving or renaming that file
  broke CI on a missing path rather than a failing test. `3b56c40` fixed it by switching to
  `clean-room/*.test.mjs` — see [[ci-hardcodes-the-clean-room-test-path]].

Retrieve this file from a ref with `MSYS_NO_PATHCONV=1` — see
[[msys-path-conversion-mangles-git-rev-paths]].
