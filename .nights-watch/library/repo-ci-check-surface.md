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
for t in .claude/workflows/*.test.js archive/clean-room/screen-brief.test.mjs; do
  node --test "$t"
done
```

Two things a worker needs to know before calling a change verified:

- **`check-descriptions.sh` only warns.** Run against the tree at `dfb4d27` it exits 0 with
  warnings and no failures. A green build is therefore not evidence that it had nothing to say —
  read its output, not its exit code.
- **The `node --test` line names one path literally.** `.claude/workflows/*.test.js` is a glob and
  degrades gracefully; `archive/clean-room/screen-brief.test.mjs` is hard-coded inside a `set -e`
  block. Move or rename that file and CI fails on a missing path rather than a failing test — see
  [[ci-hardcodes-the-clean-room-test-path]].

Retrieve this file from a ref with `MSYS_NO_PATHCONV=1` — see
[[msys-path-conversion-mangles-git-rev-paths]].
