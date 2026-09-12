---
name: repo-threat-model-operator-tooling
description: Almost nothing here has an untrusted-input path, so security findings usually die on reachability
type: calibration
---

An eight-lens hunt over a 70-file, one-week delta produced **zero** surviving findings from
`secrets`, `injection`, `exposure`, `supply-chain`, `insecure-design` and `docs`. Both confirmed
findings came from the two correctness-family lenses. That is a property of the repository, not a
quiet hunt, and future hunts should expect it.

The reasons, as established by the reachability refuters:

- The bulk of the repo is **prose** — skill markdown instructing an agent. It is gated by the
  harness's own permission system, not by anything in these files.
- The shell scripts (`omv-dev-server/`, `dead-branch-guard/`, `scripts/check-*.sh`) are
  **operator-run tooling**, executed by the machine's owner against a locally built image, with no
  route from an untrusted party.
- The `dead-branch-guard` hook is **client-side**. It affects only the pusher's own push and is
  bypassable with `--no-verify` by design — a workflow nudge, not a security control, and it must
  not be graded as one.
- `.github/workflows/checks.yml` runs on `pull_request`, **not** `pull_request_target`, so a fork
  pull request gets the restricted default `GITHUB_TOKEN` and no repository secrets. This is the
  safe variant; do not re-report it as a finding.

Practical consequence: the security lenses stay mandatory and stay worth running — a switch to
`pull_request_target`, or a real credential landing in the tree, is exactly what they exist to
catch — but this repo's defects actually live in the correctness and logic lenses. Weight the
budget accordingly.
