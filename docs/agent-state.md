# Agent state: where skills write logs and operational state

This convention answers one question: when a skill runs and needs somewhere
to write a run log, a journal, a lock, a watermark, or any other record of
*that it ran* — where does that go? It applies to the repository a skill is
acting on (its "managed repo"), which for the skills in this repository is
usually this repository itself. Decision record:
[ADR-0001](adr/0001-agent-state-location.md), accepted.

Enforced by [`scripts/check-state-paths.sh`](../scripts/check-state-paths.sh),
wired into CI (`.github/workflows/checks.yml`).

## The directory rule

A skill's operational state lives outside the tree, at:

```
~/.agent-state/<repo-slug>/<slug>/...
```

`<slug>` is exactly the skill's directory name at this repo's root — the
`<slug>` in `<slug>/SKILL.md`. Sub-paths beneath it are free: a skill can
lay out `journal.md`, `chronicles/`, `locks/`, whatever its own state shape
needs. A bare file with no `<slug>/` segment is **not conforming**, and
`scripts/check-state-paths.sh` fails the build on one.

Outside the tree is the default because in-tree state dies with the
worktree. A repository that runs agents in per-task worktrees loses every
run's state the moment a worktree is swept, and a skill whose state must
survive that then needs rescuing by hand before the sweep. Under this root
it survives the worktree, the branch and the clone.

## The override rule

Precedence, checked in this order:

1. **A skill-specific variable, if the skill defines one** — e.g.
   `MANAGER_STATE` for the `manager` skill (see `manager/DECIDING.md`).
2. **`AGENTS_STATE`** — a repo-wide override for any skill that doesn't
   define its own variable.
3. **The default above.**

`AGENTS_STATE` **replaces only the root segment** — `<slug>/` is still
appended, and it never names a skill directory outright.
`AGENTS_STATE=/var/x` puts the manager's journal at
`/var/x/manager/journal.md`, not at `/var/x/journal.md`.

**In-tree is the opt-in, not the default.** A team that wants state in the
checkout sets `AGENTS_STATE=.agent-state` in the `env` block of the
committed `.claude/settings.json`, so every clone and every worktree
inherits it. A personal override goes in `~/.claude/settings.json`. There is
no folder-presence detection: the setting is the only signal. The in-tree
root is per-checkout and one `git add -f` away from publication, so state
that must not be published stays under the default.

**First run in a repo with no setting.** Use the default and say so in the
run's report, in one line: where the state root is, and which setting flips
it in-tree. An interactive run may ask instead and write the answer into the
setting. A headless run never prompts.

**Permissions.** One line in the user's `~/.claude/settings.json` —
`permissions.additionalDirectories: ["~/.agent-state/"]` — so `Write` and
`Edit` there never prompt. `Bash` writes there already do not.

## Publication, not survival, makes a record durable

By the time a pull request is opened, everything a future reader needs is
either committed in that PR or posted on it — in the body, in a comment, or
on a linked issue. Everything else is run state and may be deleted at any
moment after merge. No artifact is durable because a file happens to
survive; it is durable because it was published.

So **reasoning and evidence are posted, not committed**: root-cause
analysis, spec, plan, review notes, verdicts and fix status go onto the PR
at publish time. They are not committed into the tree, and they do not sit
in state waiting to be rescued.

## Logs vs. deliverables

The test is decidable, not a list: **a file belongs under the state root if
and only if deleting it loses nothing that a commit, a PR, or the tracker
already records.** If a human is expected to read it later without knowing
a run happened, it is a deliverable, and it keeps its existing human-facing
home.

Audience does not decide persistence. A guide written for agents is still a
deliverable: agent-facing house guides live tracked at `docs/agents/`.

Named deliverables that do **not** move: `CLAUDE.md` and `AGENTS.md`,
`LESSONS-LEARNED.md`, `docs/adr/`, `docs/runbooks/`, `docs/agents/`,
`.out-of-scope/`, the nights-watch Library (`.nights-watch/library/`),
`docs/recurring-backlog.md` (the recurring schedule a human reads to see
what is due), `prompts/backlog.md` (`prompt-backlog`'s human-authored
queue), and `nightshift`'s `backlog.md` (its human-authored input). No
deliverable ever lives under the state root.

The nights-watch Hunt's watermark and ledger are the case worth recording,
because they went the other way: nobody ever reads them, so they are state,
but deleting them does lose something no commit records — a week of
re-auditing and a re-report of every open finding. They stay state, and the
default root is what makes them durable.

## `.agents/skills/` is not ours

OpenAI's Codex reads committed team skills from `$REPO_ROOT/.agents/skills`
and personal skills from `$HOME/.agents/skills`. No skill may tell a managed
repo to ignore `.agents/` wholesale: that single line untracks a team's
Codex skills. `scripts/check-state-paths.sh` never flags that path, in any
repository.

## Retired paths

Every skill that used to keep state somewhere else has moved. The old paths
are listed here, in one place, rather than repeated inside each skill: a
skill directory that names its own retired path fails
`scripts/check-state-paths.sh`, which is what stops a migration from quietly
reverting. A skill that needs to describe its fallback points here instead.

| Retired path | Now | Owner |
|---|---|---|
| `.agents/<slug>/` (the previous in-tree default) | `~/.agent-state/<repo-slug>/<slug>/`, or `.agent-state/<slug>/` where `AGENTS_STATE` opts in | all |
| `.nights-watch/JOURNAL.md` (also `journal.md`) | the state root's `nights-watch/journal.md` | `nights-watch` |
| `.nights-watch/chronicles/` | the state root's `nights-watch/chronicles/` | `nights-watch` |
| `.nights-watch/locks/` | the state root's `nights-watch/locks/` | `nights-watch` |
| `.nights-watch/hunts/` | the state root's `nights-watch/hunts/` | `nights-watch` |
| `~/.nights-watch/<repo-slug>/`, then `~/.agents/nights-watch/<repo-slug>/` (public-repo Hunt root) | `~/.agent-state/<repo-slug>/nights-watch/` — the default is already outside the tree, so the Hunt needs no root of its own | `nights-watch` |
| `.housekeeping/chronicles/` | the state root's `housekeeping/chronicles/` | `housekeeping` |
| `.recurring-improvement/recurring-backlog.md` | `docs/recurring-backlog.md` | `recurring-improvement` |
| `.agents/recurring-backlog.md` (bare, non-conforming) | `docs/recurring-backlog.md` | `recurring-improvement` |
| `docs/sdlc/runs/` | the state root's `sdlc-old-fashioned/runs/` | `sdlc-old-fashioned` |
| `docs/sdlc/` (spec, plan, review notes, retro) | posted on the PR — see "Publication" above | `sdlc-old-fashioned` |
| `prompts/sdlc-backlog.md` | the state root's `sdlc-old-fashioned/backlog.md` | `sdlc-old-fashioned` |
| `prompts/sdlc-backlog.md` (workflow default) | the state root's `sdlc-workhorse/backlog.md` | `sdlc-workhorse` |
| `.sdlc/chronicles/` | the state root's `sdlc-workhorse/chronicles/` | `sdlc-workhorse` |

The workflow defaults live in `.claude/workflows/`, as values in code rather
than prose. The check scans markdown only, so a path that lives in code is
not protected by it — when a workflow's default moves, the value in the
script and the example in its own header comment both have to move with it.

`.nights-watch/library/` is **not** in this table. It is a deliverable, it
stays tracked where it is, and only the run state that used to sit beside it
moved.

**A migrated skill must keep reading its old path for at least one release**
before the old path is removed, so a repo mid-upgrade doesn't silently lose
its state. Read the new path first; fall back to the retired one only when
the new path is absent and the old one exists; always write to the new path,
so a repo migrates by being run, and say in the run's report when the
fallback fired. A managed repo keeps its existing `.agents/` and
`.nights-watch/` gitignore lines for that same window, so a clone written by
the previous version keeps its logs out of the diff.

Two traps in that window, both of which have bitten already. **A root
outside the repo needs the same fallback as one inside it** — no clone or
checkout carries it, so the loss is invisible until the watermark and ledger
come back empty. And **the nights-watch journal must be tried under both
spellings**: existing repos have `JOURNAL.md`, the layout documents
`journal.md`, and on a case-sensitive filesystem looking for only one of
them finds nothing and starts a fresh journal on top of a real history.

## Enforcement

[`scripts/check-state-paths.sh`](../scripts/check-state-paths.sh), wired
into CI and covered by [`scripts/check-state-paths.test.sh`](../scripts/check-state-paths.test.sh),
enforces three things and **fails the build** on any match. A check that
cannot fail is not enforcement: `scripts/check-descriptions.sh`'s 320–1024
character warn band currently carries thirteen unresolved warnings with no
build consequence, which is the standing evidence for choosing a failing
check here.

1. It scans every `*.md` file inside each skill directory (not only
   `SKILL.md` — a skill's own layout prose regularly lives in a sibling
   file instead) for a dot-prefixed directory that is neither the state
   root nor a listed deliverable.
2. It scans the same files for a bare file directly under the state root
   with no `<slug>/` segment — the violation named in "The directory rule"
   above. There is no exemption to this one.
3. It scans the same files for any path in the Retired paths table, and
   names where that state went instead. This is what makes the migration
   stick: the generic scan in (1) cannot see these, because a non-dot path
   like `docs/sdlc/runs/` does not match its dot-directory pattern, and
   `.nights-watch/` is exempt as a whole so its tracked `library/` can
   stay — which would otherwise let the retired run-log subpaths beside it
   return unnoticed.

The only exemptions are `.agents/skills/`, which belongs to another harness,
and the two deliverable roots that are dot-directories, `.out-of-scope/` and
`.nights-watch/`. All three are permanent rather than migration TODOs. The
other named deliverables need no entry, because the script's dot-directory
pattern never matched them in the first place.
