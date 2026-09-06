# Contributing

## Checking sibling-skill links

Skill files cross-reference each other with relative links to sibling
`SKILL.md` files. Moving or archiving a skill (e.g. `git mv <skill>
archive/`) can silently break any inbound link to it.

Before opening a PR that moves, renames, or archives a skill, run:

```bash
bash scripts/check-links.sh
```

It exits non-zero and prints each broken link (`BROKEN <file>:<line> ->
<target>`) if any relative `../<dir>/.../<file>.md` link no longer resolves.
It prints nothing and exits 0 when every link is valid.

CI runs this, `scripts/check-descriptions.sh`, `scripts/check-state-paths.sh`,
and the Node tests on every push and pull request
(`.github/workflows/checks.yml`).

## Where skill run logs and state go

A skill's operational state (a run log, a journal, a lock, a watermark —
anything that records *that a run happened* rather than something a human
needs to read later) belongs under `.agents/<skill-name>/`, gitignored, in
the repo the skill is acting on. The full convention, including the
override variable and the deliverables that never move there, is in
[docs/agent-state.md](docs/agent-state.md).

Before opening a PR that adds a new skill or gives an existing one a new
state path, run:

```bash
bash scripts/check-state-paths.sh
```

It exits non-zero and prints each offender (`NONCONFORMING <file>:<line> ->
<path>`) if any skill's markdown declares a state root that isn't
`.agents/<skill-name>/...` and isn't on the script's grandfather allowlist.
It prints nothing and exits 0 when every declared state root conforms.
