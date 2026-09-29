---
name: nightshift
description: 'Implement backlog items unattended, test-first; use for overnight or autonomous backlog runs.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# NightShift

## Quick start

```
/nightshift                            # backlog.md at repo root
/nightshift backlog=docs/work.md       # custom path
/nightshift backlog="docs/backlog/*.md" # concatenate in path order
/nightshift items=123,456,789          # tracker issues in given order
/nightshift items=label:ready-for-agent # tracker query order
```

Normalize all sources into the item schema before pre-flight. Order dependencies deliberately; query order may not suit them. Tracker input is a pre-flight snapshot: later tracker edits do not change the run's backlog file.

Run records and per-item reviews belong under `~/.agent-state/<repo-slug>/nightshift/runs/YYYY-MM-DD/`, per [agent-state.md](../docs/agent-state.md). Keep the backlog at its user-selected path. Never overwrite another same-day run: use `run.md`, `run-2.md`, etc.

## Phase 1 — Pre-flight (user awake)

Read [PREFLIGHT.md](PREFLIGHT.md). Resolve design, acceptance criteria, fixtures, secrets and network questions; pre-approve permissions in `.claude/settings.local.json`; set commit/push/PR policy. Enter Phase 2 only when the backlog parses, every pending item's acceptance criteria support a failing test, foreseeable answers are in `**Notes:**`, and the user explicitly says **go**. Matching a tracker query does not make an item ready.

## Phase 2 — Loop (user asleep)

Follow [LOOP.md](LOOP.md) per item: read backlog → `in_progress` → plan TDD slice → Red → Green → Refactor → fresh adversarial review ([CODE-REVIEW.md](CODE-REVIEW.md)) → commit → push/open PR per delivery policy → post review to PR → update backlog → fresh subagent for next item. Children run Phase 2 only.

For dependent items, stack branches and PRs: each branches from its predecessor, with that branch as PR base; keep all PRs open. See LOOP.md “Stacked PRs”. Land with `merge-stack`, not ad-hoc merges.

## Backlog item schema

```md
## [pending] Short title
**Acceptance:** observable outcome the test asserts.
**Notes:** pre-flight answers + constraints.

### Run log
<appended each iteration>
```

Statuses: `pending`, `in_progress`, `done`, `blocked-on-question`, `failed-after-retries`.

## Stop conditions & question deferral

Exit when no pending items remain, all remaining items are blocked/failed, or an item fails **3 Red→Green attempts**. Prepend a run summary to the backlog on exit.

For ambiguity unresolved by the codebase, append `Q:` to the Run log. For reversible choices (names, helpers, log messages, config values, wording), add `A: chose X because Y`. For irreversible or grave choices (schema, public API, secrets, deletion, publishing, spending), mark `blocked-on-question`. Judge consequences, not file type. Details: [LOOP.md](LOOP.md).

## Repo discovery (at pre-flight)

Discover conventions in order; stop when confident:

1. `CLAUDE.md`/`AGENTS.md` and sibling `*/CLAUDE.md`/`*/AGENTS.md`.
2. `.github/workflows/*.yml`.
3. Root build manifests.
4. Saved auto-memory; honor it without re-asking.
5. README as last resort.

Write findings into `## NightShift detected conventions` atop the backlog for children to reuse. Honor inherited instructions and memories; do not reintroduce retired dependencies.

## Adversarial code review (every code item)

After Green+Refactor and before commit/PR, a fresh reviewer receives the diff without the implementer's rationale and hunts at extra-high recall. Fix confirmed in-scope bugs with regression tests; file pre-existing/out-of-scope bugs as follow-up issues. Read [CODE-REVIEW.md](CODE-REVIEW.md) for the protocol.

## Adversarial source-verification mode (optional)

Use when external-fact accuracy is an item's main risk: sourced values, citations, compatibility, third-party behavior or entity attributes that tests cannot verify. Read [ADVERSARIAL.md](ADVERSARIAL.md) for protocol, prompts and calibration. A generator drafts; an independent reviewer re-fetches every cited source and checks each claim. They must not share context. This replaces or supplements code review as appropriate.

### Source-verification rules that transfer across projects

Project-specific source allowlists, field conventions and tolerances stay in the project's skill.

1. Before writing an externally sourced field, capture the exact supporting sentence from its cited URL. Without one, drop the field; do not infer or approximate. Free-text quotations must also be verbatim on a cited source; otherwise paraphrase without quotes.
2. Corroboration requires matching labels/definitions, not merely matching numbers.
3. Flag contradictions within a source and downgrade confidence; do not select the favorable reading.
4. Do not attribute finer precision to a source than it publishes. Attribute extra precision to its actual source.
5. For conflicting entity names, recognize rebrands and short forms; use the majority for equivalent abbreviations. Null only genuinely distinct, non-equivalent entities.
6. Express specified tolerances as concrete tiers: clean, borderline-with-note, needs-explanation, drop.
7. The reviewer re-fetches every cited URL and checks its body supports the claim; domain reputation is no exemption.
8. Track rejection and downgrade rates separately. Accepted corrections must inform prompt tuning.
9. Record specific drop reasons for the next cycle; recurring patterns may reveal source-allowlist gaps.
10. Identical round numbers across sources suggest a shared origin, not independent corroboration. Keep lower confidence unless an independent source agrees.
11. A failed fetch is not proof a source is gone. Try another method, such as `curl -s -L`, correcting charset decoding (e.g. UTF-16 BOM via `iconv`) if needed. Do not discard a URL merely because one tool returned empty or garbled content.
