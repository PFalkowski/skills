---
name: nightshift
description: Autonomously implement backlog work overnight using TDD (Red → Green → Refactor) per item. Pre-flight grills the user for blockers and stages tool permissions, then loops through the backlog spawning fresh subagents per item to keep context small. Defers questions back to the backlog file rather than stopping. Use when the user wants Claude Code to run unattended on a list of work items, mentions "night shift", "overnight run", "autonomous backlog", "ralph wiggum loop", or invokes /nightshift.
---

# NightShift

Autonomous overnight implementation of a backlog using TDD. Two phases: a synchronous **pre-flight** with the user awake (grilling + permission staging), then an asynchronous **loop** that picks each item, drives it Red→Green→Refactor, and moves on without stopping for questions.

## Quick start

```
/nightshift                          # uses backlog.md at repo root
/nightshift backlog=docs/work.md     # custom path
```

## Phase 1 — Pre-flight (user awake)

Before any code change, walk through [PREFLIGHT.md](PREFLIGHT.md). It enumerates:
- The question categories that must be cleared (design ambiguity, acceptance criteria, fixtures, secrets, network).
- The permission grants to pre-approve in `.claude/settings.local.json` so the loop never prompts.
- Commit / push / PR policy.

Pre-flight succeeds when:
- Backlog parses into the [item schema](#backlog-item-schema).
- Every pending item has acceptance criteria specific enough to write a failing test for.
- All foreseeable Q's are answered, with answers inlined into the backlog `**Notes:**` block.
- The user has explicitly said "go".

**Do not enter Phase 2 without an explicit "go".**

## Phase 2 — Loop (user asleep)

Follow [LOOP.md](LOOP.md) per item: read backlog → mark `in_progress` → plan TDD slice → Red → Green → Refactor → update backlog → spawn fresh subagent for next item.

Spawned subagents run **Phase 2 only** — they must not re-enter pre-flight.

## Backlog item schema

```md
## [pending] Short title
**Acceptance:** observable outcome the test asserts.
**Notes:** pre-flight answers + constraints.

### Run log
<appended by NightShift each iteration>
```

Status: `pending` | `in_progress` | `done` | `blocked-on-question` | `failed-after-retries`.

## Stop conditions

The loop exits when any of:
- No pending items remain.
- All remaining items are `blocked-on-question` or `failed-after-retries`.
- A single item fails to go green after **3** Red→Green attempts (3 balances flake-vs-wedged; past 3, the cost of more attempts exceeds the value of human judgment).

On exit, prepend a summary block to the backlog: items completed, deferred, failed, wall-clock.

## Question deferral

When the loop hits an ambiguity it can't resolve from the codebase:
- Append `Q: <question>` to the item's Run log.
- Decide reversibility:
  - Reversible (variable name, internal helper, log message) → inline `A: chose X because Y` and proceed.
  - Irreversible (schema migration, public API, secret rotation, deletion of code that may have hidden callers) → mark `blocked-on-question`, move on.

The user reads `Q:`/`A:` entries in the morning to validate or correct.

## Repo discovery (at pre-flight)

The skill is language- and toolchain-agnostic — discover the repo's conventions at pre-flight rather than assume them. Walk these sources in order, stop when you have a confident answer:

1. **`CLAUDE.md` + sibling `*/CLAUDE.md`** — project-authored instructions. Trust these first.
2. **`.github/workflows/*.yml`** — the canonical build/test incantation lives here for any repo with CI.
3. **Build manifests at repo root** — `Makefile`, `justfile`, `package.json` (scripts), `pyproject.toml` / `tox.ini`, `Cargo.toml`, `*.sln` / `*.csproj`, `go.mod`, `mix.exs`, `build.gradle*`, `pom.xml`.
4. **Saved auto-memory** loaded into context at conversation start — durable per-user preferences (test style, workflow shape, areas to avoid). Honor these without re-asking.
5. **README** — last resort; often stale.

Inline what you find into a `## NightShift detected conventions` block at the top of the backlog, and have the user confirm during pre-flight. Spawned subagents read this block instead of re-discovering.

Subagents also inherit `CLAUDE.md` and saved memories automatically — they must respect those (e.g. don't reintroduce a retired dependency, don't violate a documented architectural rule).
