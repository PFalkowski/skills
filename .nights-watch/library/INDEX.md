# Library — durable facts of the Watch

Read this index first. Open only the entries relevant to what you are doing — the one-line
descriptions exist so that the Library keeps contexts lean rather than becoming the thing that
bloats them.

## Conventions — house rules of this repo

- [repo-ci-check-surface](repo-ci-check-surface.md) — what CI actually runs, and which of those checks can fail a build (`check-descriptions.sh` fails on length/quoting/self-naming, only warns in the 320-1024 char band)

## Gotchas — traps that must not cost twice

- [msys-path-conversion-mangles-git-rev-paths](msys-path-conversion-mangles-git-rev-paths.md) — on Windows Git Bash, `git show <ref>:<path>` silently becomes a bogus Windows path; the failure looks like absence
- [ci-hardcodes-the-clean-room-test-path](ci-hardcodes-the-clean-room-test-path.md) — a literal path in `checks.yml`'s `set -e` loop broke CI on a rename; fixed in `3b56c40` by switching to a glob
- [fingerprint-drift-splits-one-defect](fingerprint-drift-splits-one-defect.md) — two lenses found one bug and it was not marked corroborated; check corroboration by hand

## Calibration — what things actually cost, and where defects actually live

- [repo-threat-model-operator-tooling](repo-threat-model-operator-tooling.md) — almost nothing here has an untrusted-input path, so security findings usually die on reachability
- [hunt-token-actuals-first-party](hunt-token-actuals-first-party.md) — an 8-lens hunt with refuters cost ~850k tokens across 14 agents; the 40k/lens reserve is far too low
