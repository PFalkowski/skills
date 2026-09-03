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

CI runs this, `scripts/check-descriptions.sh`, and the Node tests on every
push and pull request (`.github/workflows/checks.yml`).
