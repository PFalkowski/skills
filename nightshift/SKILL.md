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

## Adversarial verification mode (for verification-heavy items)

The default LOOP is single-agent TDD: one subagent writes a test, makes it pass, commits. That's right when the item's correctness is checkable by a unit test compiling and passing. It's wrong when the item's correctness depends on **claims about the world** the test runner can't validate — data fetched from web sources, citations supporting numeric claims, entity attributes (operators, owners, locations), historical figures.

For those items, run **two-agent adversarial verification** instead.

### When to use it

A backlog item warrants adversarial mode when one or more apply:
- The deliverable is a JSON/YAML/Markdown record sourcing claims from the web.
- The "test" is whether external sources actually say what's claimed (no test runner can check this — only WebFetch can).
- A failure mode includes hallucination: fabricated coordinates, plausible-sounding numbers not in any cited source, entity names lifted from context rather than sources.
- The cost of a wrong claim landing in the seed is greater than the cost of running a second subagent.

If none of those apply, use the default single-agent TDD LOOP.

### The pattern (see [ADVERSARIAL.md](ADVERSARIAL.md) for the full protocol)

1. **Generator subagent (fresh context, WebFetch + WebSearch enabled)** — produces N candidate records. Self-rates each candidate's confidence per the project's confidence ladder. Writes proposals to a staging dir.
2. **Reviewer subagent (fresh context, no shared memory with generator)** — independently re-fetches every cited URL. Audits per-claim verbatim against the cited source. Accepts (move to canonical), downgrades (edit confidence + notes, move to canonical), or rejects (delete + log reason).
3. **Parent commits** the accepted+downgraded records. Tracks BOTH rejection rate AND downgrade rate as quality signals.

Critical: the two subagents MUST NOT share context. The reviewer's value comes entirely from independence — if it sees the generator's rationale, it inherits the generator's blind spots.

### Hard rules that transfer across projects

These are the project-agnostic adversarial-verification rules earned across actual cycles. Project-specific rules (e.g. "GEM is for magnitudes only, never centroids" in geo-data work) layer on top in the project's own skill.

1. **Verbatim-quote pre-flight on numeric claims.** Before the generator writes any number into a structured field, it must paste in its scratchpad the exact sentence from a cited URL containing that number. If no cited URL contains the value, **drop the field**. Don't infer; don't approximate; don't lift from secondary literature you're not citing.

2. **Cross-source match requires identical CATEGORY, not just identical number.** When pairing two figures across sources as "cross-corroborated", their category labels must match verbatim. "Estimated in place: 12.6 Gbbl" and "recoverable reserves: 12.0 Gbbl" are NOT a match — different categories, even if the number looks similar. Category-mismatch is a more common failure than number-mismatch and harder to spot.

3. **Intra-source contradiction degrades confidence.** If a single source contradicts itself (e.g. an article's infobox publishes one number, the lede publishes a different number for the same claim), flag the contradiction in notes and DEGRADE rather than picking the more flattering reading.

4. **Claimed-source-precision honesty.** When citing a source's value, do not over-claim its precision. If the source publishes degree-minute coordinates, don't paste sub-decimal seconds and pretend they came from there — that precision came from somewhere else, attribute it accurately.

5. **Entity-name match with rebrand-equivalence + 2-of-3 majority.** When sources disagree on an entity name (operator, owner, manufacturer), recognize rebrand-equivalence (Total S.A. ≡ TotalEnergies post-2021; Facebook ≡ Meta post-2021; Twitter ≡ X post-2023). Use 2-of-3 majority when sources merely use shorter forms ("Basra Oil" ⇆ "Basra Oil Company"). Only null when all sources name distinct non-equivalent entities.

6. **Concrete drift thresholds, not "approximately".** If the deliverable specifies a tolerance, make it operationalizable: tier the threshold (e.g. ≤5 km clean / 5–6 km borderline-with-notes / 6–50 km requires explanation / >50 km drop). "Approximately X" is interpreted differently by every reviewer; tiered thresholds aren't.

7. **Trust-but-verify on every URL.** The reviewer must WebFetch every cited URL and confirm the body text supports each claim. No skipping URLs because "this domain is reliable". The whole point of independent verification is that the reviewer doesn't share the generator's trust assumptions.

8. **Track BOTH rejection AND downgrade rate.** Rejection rate (proposals deleted) and downgrade rate (proposals accepted with stricter confidence / dropped fields / nulled attributes) are different signals. Pure rejection-rate tracking misses cycles where every proposal is "accepted with corrections" — those corrections are quality interventions and should drive prompt-tuning.

9. **Single-source category mismatch is the most common failure mode.** When a value's category label differs between the source's body text and where the proposal places it, it's almost always a paraphrase error, not a genuine cross-source disagreement. Default to "the source's exact category wins; we don't recategorize".

10. **Document why a candidate was dropped, not just that it was.** Generator rejection logs are training data for the next round. "Dropped — no Wikidata P625" is fine; "dropped" alone is not. The pattern of dropped candidates over many runs reveals where the source-allowlist needs expansion.

11. **Knowledge-graph entity-typing reflex check (when a Wikidata-only or similar KG-only path is accepted).** Before trusting a knowledge-graph QID/URI that lacks a Wikipedia article (or equivalent first-class source), verify the entity's `instance-of` (P31 in Wikidata) is the expected resource class. A QID returning `instance-of` taxon, asteroid, painting, software, airport, aerodrome, or similar name-collision targets — or auto-import-corrupted values like the well-known "South Saqqara Stone" propagation in late-2025 Wikidata bots — is a name-collision and the KG-only path fails. *Conversely:* P31 ABSENCE is not disqualifying when independent identifier corroborators (e.g. GeoNames + matching narrative + matching coordinate) confirm the entity.

12. **Exact-zero-drift on round numbers across sources = derivative reporting, not independent corroboration.** When two sources publish the same magnitude with zero decimal drift on a round number (5,700 = 5700.0; 17,000 = 17000.0; 1,000 = 1000.0), this is a fingerprint of shared upstream sourcing — typically a national operator's press release, a regulator's filing, or a single primary database — being mirrored by both downstream sources. These are NOT independent corroborators. The cross-source match satisfies rule 2's category-equality check but fails the spirit of independence. Hold at the lower confidence tier unless a third independent allowlisted authority publishes the same figure.

13. **Quoted strings in narrative `notes` must appear verbatim on a cited URL** (or be paraphrased without quote marks). Decorative quotation invites cycle-to-cycle confirmation drift: a future reviewer or auditor reading the notes treats the quoted string as already-verified ground truth, but no source on the citation list actually contained it. This is a refinement of rule 1 (verbatim-quote pre-flight on numeric claims) extended to qualitative claims.

### Calibration

Reviewer rejection rate <10% over a run of ≥10 items suggests the reviewer is too lenient. >80% suggests the generator is broken. Both states block productive work.

Tuning loop: after each cycle, the reviewer's "next-cycle prompt-tuning notes" (concrete proposed prompt changes derived from the round's actual failures) get folded back into the generator + reviewer prompt templates for the next cycle. The cumulative-hard-rules list grows monotonically; rules earned from failures don't leave.
