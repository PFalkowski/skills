---
name: nightshift
description: Autonomously implement backlog work overnight using TDD (Red → Green → Refactor) per item. Pre-flight grills the user for blockers and stages tool permissions, then loops through the backlog spawning fresh subagents per item to keep context small. Defers questions back to the backlog file rather than stopping. Use when the user wants Claude Code to run unattended on a list of work items, mentions "night shift", "overnight run", "autonomous backlog", "ralph wiggum loop", or invokes /nightshift.
---

# NightShift

## Quick start

```
/nightshift                          # uses backlog.md at repo root
/nightshift backlog=docs/work.md     # custom path
```

### Multiple runs on the same date

When run records are organized by date (`.../runs/YYYY-MM-DD/...`), a second cycle that day MUST NOT overwrite the first — increment a filename suffix (`nightshift-backlog.md` → `-2.md` → `-3.md`) within the shared date directory. Each cycle's exit summary prepends to its own file; per-item review logs sit alongside (distinct slugs rarely collide). The date dir is the audit unit; the suffix disambiguates within the day without losing the prior cycle's Q:/A: trail.

## Phase 1 — Pre-flight (user awake)

Walk through [PREFLIGHT.md](PREFLIGHT.md): clear the question categories (design ambiguity, acceptance criteria, fixtures, secrets, network), pre-approve the permission grants in `.claude/settings.local.json` so the loop never prompts, and set commit/push/PR policy. **Pre-flight succeeds only when** the backlog parses into the item schema, every pending item has acceptance criteria specific enough to write a failing test for, all foreseeable Q's are answered inline in `**Notes:**`, and the user has explicitly said **"go"**. Do not enter Phase 2 without it.

## Phase 2 — Loop (user asleep)

Per item, follow [LOOP.md](LOOP.md): read backlog → mark `in_progress` → plan TDD slice → Red → Green → Refactor → **adversarial code review** ([CODE-REVIEW.md](CODE-REVIEW.md)) → commit + push + open PR → **post the review to the PR** → update backlog → spawn a fresh subagent for the next item. Spawned subagents run Phase 2 only — never re-enter pre-flight.

When items build on each other, **stack the PRs** (each branch off the previous; PR base = previous branch; keep all open — see LOOP.md "Stacked PRs"). To **land** the chain afterward, use the `merge-stack` skill; don't hand-merge ad hoc.

## Backlog item schema

```md
## [pending] Short title
**Acceptance:** observable outcome the test asserts.
**Notes:** pre-flight answers + constraints.

### Run log
<appended each iteration>
```

Status: `pending` | `in_progress` | `done` | `blocked-on-question` | `failed-after-retries`.

## Stop conditions & question deferral

The loop exits when no `pending` items remain, all remaining are `blocked-on-question`/`failed-after-retries`, or an item fails **3** Red→Green attempts (past 3, human judgment beats more tries). Ambiguity it can't resolve from the codebase → append `Q:` to the Run log, then inline `A: chose X because Y` (reversible: variable name, helper, log message) or mark `blocked-on-question` (irreversible: schema, public API, secret, deletion). On exit, prepend a run summary to the backlog. Detail in [LOOP.md](LOOP.md).

## Repo discovery (at pre-flight)

Language- and toolchain-agnostic — discover conventions, don't assume them. In order, stop when confident: (1) `CLAUDE.md` + sibling `*/CLAUDE.md`; (2) `.github/workflows/*.yml`; (3) root build manifests (`Makefile`, `package.json`, `pyproject.toml`, `*.sln`/`*.csproj`, `go.mod`, `pom.xml`, …); (4) saved auto-memory (honor without re-asking); (5) README (last resort). Inline findings into a `## NightShift detected conventions` block atop the backlog — subagents read it instead of re-discovering, and inherit `CLAUDE.md` + memories automatically (don't reintroduce a retired dep or violate a documented rule).

## Adversarial code review (the default second pass — every code item)

The green test proves only what the implementer thought to assert. So after Green+Refactor, before commit/PR, a **fresh reviewer subagent that never sees the implementer's rationale** hunts the diff at extra-high recall for what the test missed; confirmed bugs get a regression test + fix in-item, pre-existing/out-of-scope ones get a follow-up issue. This is the standard review pass for the overwhelming majority of items, which are code. Protocol + hard rules: [CODE-REVIEW.md](CODE-REVIEW.md).

## Adversarial source-verification mode (optional — for the rare fact-heavy item)

Most items are code and use the code review above. A *minority* instead turn on **claims about the world** a test runner can't check — values copied from external docs/specs/dashboards, citations backing a numeric claim, version or compatibility facts, third-party API behavior, entity attributes. For those, run **two-agent adversarial verification** instead of (or alongside) the code-review pass: a generator subagent produces the candidate output, an independent reviewer subagent re-fetches every cited source and audits each claim verbatim. The two MUST NOT share context — the reviewer's value is entirely its independence. This mode is the exception, not the rule; reach for it only when external-fact accuracy is the item's main risk. Full protocol, prompt templates, and calibration: [ADVERSARIAL.md](ADVERSARIAL.md).

### Source-verification rules that transfer across projects

Project-agnostic rules for the source-verification mode, earned across actual cycles. A project that leans on this mode keeps its own domain rules — source allowlists, field conventions, tolerance thresholds — in that project's own skill, layered on top.

1. **Verbatim-quote pre-flight on every external fact.** Before writing a value lifted from a source into a structured field, paste the exact sentence from the cited URL that contains it. If no cited source contains the value, **drop the field** — don't infer, approximate, or lift from uncited material. This extends to quoted strings in free-text notes: a quotation must appear verbatim on a cited source, or be paraphrased without quote marks (decorative quotes invite later cycles to treat them as already-verified).

2. **Cross-source agreement requires the same MEANING, not just the same number.** Two sources corroborate only when their labels/definitions match, not merely their digits. A value labelled one thing in source A and a different thing in source B is not a match even when the numbers are close. Label-mismatch is a more common failure than number-mismatch and harder to spot.

3. **Intra-source contradiction degrades confidence.** If a single source contradicts itself (summary vs detail, header vs body, infobox vs prose), flag it in notes and DOWNGRADE rather than picking the more flattering reading.

4. **Source-precision honesty.** Don't present a value at finer precision than the cited source actually published — that extra precision came from somewhere else; attribute it accurately.

5. **Entity-name match with rebrand-equivalence + majority.** When sources disagree on a name (owner, author, vendor, maintainer), recognize rebrand-equivalence (Facebook ≡ Meta post-2021, Twitter ≡ X post-2023) and short-form equivalence ("Acme" ⇆ "Acme Corp"); use a majority when sources merely abbreviate. Null the field only when sources name genuinely distinct, non-equivalent entities.

6. **Concrete thresholds, not "approximately".** If the deliverable specifies a tolerance, make it operational — tier it (clean / borderline-with-note / needs-explanation / drop). "Approximately X" is read differently by every reviewer; a tiered threshold isn't.

7. **Trust-but-verify every cited URL.** The reviewer re-fetches every source and confirms the body text supports each claim. No skipping a source because "that domain is reliable" — the whole point of independent verification is that the reviewer doesn't inherit the generator's trust assumptions.

8. **Track BOTH rejection AND downgrade rate.** Rejections (output deleted) and downgrades (accepted with stricter confidence, a dropped field, a nulled attribute) are different signals. Tracking only rejections misses cycles where everything is "accepted with corrections" — those corrections are real quality interventions and should drive prompt-tuning.

9. **Document WHY a candidate was dropped, not just that it was.** Drop reasons are the next cycle's input. "Dropped — the source never stated the value" is useful; "dropped" alone is not. The pattern of drops over many runs reveals where the source-allowlist needs widening.

10. **Zero drift on a round number across sources is a shared-origin fingerprint, not independent corroboration.** When two sources publish the identical round figure with no variation, they are likely mirroring one upstream origin (a press release, a single database) rather than independently confirming it. Hold at the lower confidence tier unless a genuinely independent source agrees.

11. **When a fetch tool can't retrieve a cited URL, change the fetch method — don't drop the URL.** A page that returns empty or garbled bytes through one tool may return cleanly via `curl -s -L` (optionally re-decoding the charset, e.g. piping through `iconv` when the bytes carry a UTF-16 BOM). Rule 7 gets no exemption for an awkward URL; a tool failure is not proof the source is gone, and "WebFetch returned empty" is not the same as "the snapshot is missing".
