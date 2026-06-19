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

### Multiple runs on the same date

When the project organises run records by date (e.g. `docs/data-quality/runs/YYYY-MM-DD/nightshift-backlog.md`), a second cycle on the same date MUST NOT overwrite the prior cycle's backlog. **Increment a numeric suffix on the filename**, keeping the date directory shared so all cycles on that date remain co-located in the audit trail:

- 1st cycle: `nightshift-backlog.md`
- 2nd cycle: `nightshift-backlog-2.md`
- 3rd cycle: `nightshift-backlog-3.md`
- …and so on.

The same suffix carries through to the exit summary inside that file (each cycle's exit summary is prepended to its own backlog file, not the prior cycle's). Per-item review logs (`<slug>-review.md`) live alongside in the same date directory regardless of cycle number — collisions are unlikely because each item targets a distinct slug.

Rationale: the date directory is the audit unit (one folder per real-clock day); the cycle suffix disambiguates within the day without breaking that contract. Overwriting a prior cycle's backlog loses the Q:/A: trail, run logs, and exit summary the user needs for morning review.

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

Follow [LOOP.md](LOOP.md) per item: read backlog → mark `in_progress` → plan TDD slice → Red → Green → Refactor → **adversarial code review** ([CODE-REVIEW.md](CODE-REVIEW.md)) → commit + push + open PR → **post the review to the PR** → update backlog → spawn fresh subagent for next item.

Spawned subagents run **Phase 2 only** — they must not re-enter pre-flight.

When items build on each other, stack the PRs (each branch off the previous; PR base = previous branch; keep all open) — see LOOP.md "Stacked PRs". To **land** a stacked chain afterward, use the `merge-stack` skill (it handles the squash-rebase and cascade-close traps); don't hand-merge ad hoc.

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

## Adversarial code review (every code item)

The green test proves only what the *implementer* thought to assert — it cannot catch the bug in the branch the implementer didn't test, the guard a refactor silently dropped, or the caller the change just broke. So **every code item gets a second, independent pass**: after Green+Refactor and before the commit/PR, spawn a **fresh reviewer subagent that never sees the implementer's rationale** and have it hunt the diff for correctness bugs at extra-high recall. Confirmed bugs get a regression test + fix in-item; pre-existing or out-of-scope bugs the diff merely surfaced get a follow-up issue. Full protocol + hard rules: [CODE-REVIEW.md](CODE-REVIEW.md).

This is the code-correctness sibling of the data-claim mode below — same governing principle (**independence**: the reviewer must not inherit the generator/implementer's blind spots), different target (implementation vs. claims about the world).

## Adversarial verification mode (for verification-heavy items)

The default LOOP is single-agent TDD: one subagent writes a test, makes it pass, commits. That's right when the item's correctness is checkable by a unit test compiling and passing. It's wrong when the item's correctness depends on **claims about the world** the test runner can't validate — data fetched from web sources, citations supporting numeric claims, entity attributes (operators, owners, locations), historical figures.

For those items, run **two-agent adversarial verification** instead (this is *in addition to* the code-review pass when an item has both an executable surface and web-sourced claims).

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

14. **Wayback / web-archive URLs may require non-WebFetch fetch methods.** When a Wayback URL (`web.archive.org/web/...`) returns garbled bytes, is blocked at the WebFetch tool layer, **returns an empty body where curl returns content cleanly**, or returns content with a UTF-16LE BOM (`FF FE`), fall back to `curl -s -L "<url>"` via Bash — optionally piped through `iconv -f UTF-16LE -t UTF-8` if the BOM signals UTF-16. Do NOT skip a cited Wayback URL because WebFetch fails. The reviewer's value collapses if any URL goes unverified; rule 7 (trust-but-verify) does not get a Wayback exemption. Pivot the fetch method; don't drop the URL. **Crucially: a Wayback availability or content URL returning empty / 404-like / "no content" via WebFetch is NOT proof the snapshot is missing — curl may return tens of kilobytes of valid HTML from the same URL.** A prior cycle's "exhaustive search across dozens of Wayback availability queries via WebFetch, all empty" is therefore not a true exhaustion — a curl retry is mandatory before declaring `blocked-on-question` on Wayback-thin data. The operative retry mechanism is the fetch-method difference (curl vs WebFetch); the `iconv` decode is secondary, mattering only once curl has retrieved a UTF-16LE body that WebFetch returned empty on.

15. **Publisher-asserted rebrand-equivalence for row-redefinition.** When a primary source (publisher) consolidates or splits its own data rows mid-series, citing the post-consolidation row for the pre-consolidation entity is acceptable ONLY IF: (a) the publisher itself asserts the rebrand-equivalence verbatim on its own page (not the reviewer inferring it); (b) the rebrand is acknowledged as a SCOPE CHANGE — every post-rebrand entry's `notes` MUST annotate this with the specific date and the components added/removed; (c) the dominant component of the new aggregate is still the original entity. The discontinuity at the rebrand-boundary must NEVER be presentable as real entity-level change — the value-step is publisher-bookkeeping, not the world changing. Canonical example: EIA's Dec-2017 DPR consolidation of "Marcellus" and "Utica" rows into a single "Appalachia" row produced a +60% value-step (19,322 → 31,037 MMcf/day) at the row boundary; without the rebrand annotation, that step would mislead a reader as a real production surge.

16. **Source-survey pre-commitment check before pivoting onto a primary publisher's country/sector brief.** Before committing to a multi-vintage publisher brief (e.g. EIA Country Analysis Briefs, IEA country profiles, USGS Mineral Commodity Summaries) as the SPINE of a sweep, sample-fetch (a) the live brief AND (b) at least one Wayback capture from the target year range. If the live brief is a thin stub (<20 KB or 0 mentions of the target entity) AND Wayback captures are similarly thin, **abort the brief pivot — the publisher likely never structurally covered this country/entity at depth**. Don't push through with thin stubs and call it a sourcing exercise. Two recovery paths before giving up on the publisher: (i) pre-rebrand domain captures via curl per rule 14 (e.g. `eia.doe.gov/emeu/cabs/<country>.html` for pre-2008 EIA briefs survive deeper than modern `eia.gov` Wayback captures); (ii) older Wayback URL patterns the modern site no longer serves (e.g. EIA's `cab.cfm?fips=<code>` + `beta/international` paths viable for 2010-2018 captures even when the modern URL is a stub). The lesson is **pre-check, don't pre-assume**: a publisher brief that covers one country/entity at depth does not guarantee the next is covered — confirm per-entity before adopting the brief as the sweep spine.

    **Failure-shape taxonomy (rules 16 + 17 unified — 6 shapes now codified).** Before pivoting onto a publisher's brief as the spine, classify the failure risk:

    | # | Shape | Diagnostic | Recovery |
    |---|---|---|---|
    | 16-main | Thin stub (live + Wayback both <20KB / 0 mentions) | publisher dropped the country/entity entirely | Pivot to GEM Wiki + Wikipedia |
    | 16-c1 | `tbd` / null-cell pattern across vintages (row present, cell empty) | publisher acknowledges entity exists but never received figures | Same as thin-stub |
    | 16-c2 | Country-aggregate-only (publisher frames the country but never breaks out fields) | Wayback search returns country-level narrative + 0 field mentions across all vintages | No publisher recovery — pivot to Wikipedia/GEM single-figure-stubs |
    | 16-c3 | Per-field 1-vintage-only (publisher has the figure once; all other vintages narrative) | grep for the entity name returns exactly 1 numeric hit across ~10 vintages | Accept 1-2 entries; honest result |
    | 16-c4 | Firm-policy redacted (firm publishes higher-level aggregate but redacts sub-area rates at publication policy) | a third-party reserves table or 10-K confirms sub-area rows exist but the `production` column is blank | No recovery without firm-publication allowlist extension |
    | 17-main | Discontinued product (Wayback "Next Release Date: Discontinued") | publisher paused recurring product; prior vintages canonical but no extension forward | Use pre-discontinuation vintages; expect coverage gap |
    | 17-c1 | Table removed from newer vintages (silent scope-cut; brief continues, table dropped) | grep for the entity name returns hits in older vintages, 0 in newer | Use pre-removal vintages; expect coverage gap |
    | 16-c5 | Vintage-windowed coverage (publisher had per-field text in some vintages, country-aggregate in others) | grep finds entity in vintage range [X, Y]; no hits outside | Use the vintage window's hits; expect bounded coverage |
    | 16-c6 | Entity never produced commercially (deposit exists in geological/exploration sense; no production history to find) | Wikipedia/USGS/Wikidata describe the deposit as PFS / exploration / pre-feasibility / "proposed mine"; resource-estimate ≠ production | Ship empty-entries-array sidecar with "never-produced" annotation; rule 2 forbids citing PFS/reserves as production |

    Rules 16+17 share the operational outcome: when the spine fails at any of these shapes, pivot to GEM Wiki + Wikipedia + portfolio articles, accept honest 0-3 entry result rather than padding. The shapes differ in their *diagnostic signature*, not in what you should do about them. Knowing which shape you're at lets the source-survey terminate faster (e.g. 16-c2 country-aggregate is diagnosable in 2 Wayback fetches; you don't need to grind through 10+).

    **Corollary — publisher `tbd` / null-cell pattern across multiple vintages = same outcome as thin-stub.** A different failure shape from the bare thin-stub: the publisher *does* list the target entity by name (the row exists), but the data cell reads `tbd` / `n/a` / `—` / empty across every vintage. This is the publisher signalling honestly that they cover the entity's existence but never received the figures. Operationally identical to a thin stub: abort the brief pivot, fall back to GEM Wiki + Wikipedia + portfolio articles, accept an honest 0-3 entry result. **Don't** mistake the presence of the row name for coverage — verify a cell has a numeric value before counting it. The `tbd` pattern is a per-field property of the publisher's editorial cap — a secondary entity may ship its name into the brief (a populated row) but never its data (a `tbd` cell), while the brief's primary entities carry populated cells — not a per-vintage problem solvable by older captures.

17. **Publisher-product lifecycle ≠ publisher viability.** A publisher (EIA, USGS, IEA, BP, IHS) may remain trusted and allowlisted while specific *products* from that publisher are discontinued, renamed, or scope-reduced. When a sweep's spine relies on a specific recurring product (e.g. EIA Top 100 Oil & Gas Fields, EIA Drilling Productivity Report, USGS Minerals Yearbook chapters, IEA Oil Market Report annual archive, BP Statistical Review), the rule-16 sample-fetch must additionally check the product's "Next Release Date" or last-update marker on the live and most-recent-Wayback page — a discontinued or paused product has a hard endpoint date past which no further vintages exist. Prior-vintage captures of a discontinued product remain valid sources for the years they covered (subject to rule 14 fetch-method pivots), but **cannot be extrapolated forward** past the discontinuation date by citing a later Wayback snapshot of a different EIA product as "EIA still publishes this". A common failure shape: a sweep finds a usable product across 4-7 vintages, expects the same product to cover the late-2010s / 2020s, and pads the late years with figures from a different EIA product whose category does not match — violating rule 2 (cross-source category match) under the cover of "same publisher". A shorter honest result bounded to the years the product actually covered beats a padded one that splices in a different, category-mismatched product. Operationally: when a sweep crosses a known product-lifecycle boundary (e.g. the EIA Top 100 Oil & Gas Fields product, whose Wayback page reads "Next Release Date: Discontinued" after its 2013 release; the 2017 EIA Marcellus/Utica → Appalachia consolidation per rule 15; a USGS Yearbook annual schedule slip), expect a coverage gap rather than padding.

    **Corollary — table-removed-from-newer-vintages (silent scope-cut).** Distinct from "discontinued product" (whole product gone) and rule 16 corollary `tbd` (cell present but null): the publisher *continues* to ship the brief but *removes the table* carrying the target entity in a later vintage. Old vintages remain canonical sources for the years they covered; new vintages will not extend forward. The tell: grep finds the entity's table in pre-rebrand and mid-series brief vintages (sometimes only via curl + UTF-16LE iconv per rule 14) but it is absent from later vintages while the brief itself ships on. Operational outcome: same as rule 17 main rule (treat as discontinued for the dropped table; bound the year-span at the last vintage that still carried the table); use the corollary to distinguish it from `tbd` (rule 16 corollary). Three publisher-failure shapes are now codified: discontinued product (rule 17 main), table removed (rule 17 corollary), `tbd`/null-cell (rule 16 corollary).

18. **Sibling-fetch reuse on a proven regional spine.** When a multi-vintage publisher brief has been confirmed (per rule 16) as a working spine for one entity in a country/region, subsequent items targeting other entities in the same country/region SHOULD start by reading the prior item's review log "Inputs" section to extract the exact URL list of vintages that returned content — then independently re-fetch every URL per rule 7 (no scratchpad inheritance, no trust transfer). This cuts the source-survey time from ~20 minutes (sweep 10+ candidate URLs from scratch) to ~5 minutes (re-fetch 3-5 known-good URLs). Critical: the reviewer phase MUST treat the re-fetched URLs as if discovered for the first time — fresh WebFetch / curl into a separate scratchpad, body-text grep for the verbatim quote anchors, no shortcut "the prior item already verified this URL". Rule 7 trust-but-verify is what distinguishes sibling-fetch reuse from trust-chain corruption. **The sibling-fetch URL list is itself a deliverable** — every review log under a multi-vintage publisher spine MUST have an "Inputs" section listing the exact URLs that returned content; this is what makes the pattern repeatable. Note the failure mode: sibling-fetch does NOT extend a spine that doesn't already cover the sibling at depth — a brief that carries a region's primary entities at depth may still have only `tbd` cells for its secondary ones (rule 16 corollary). Sibling-fetch reuses a working spine; it doesn't repair a broken one.

### Calibration

Reviewer rejection rate <10% over a run of ≥10 items suggests the reviewer is too lenient. >80% suggests the generator is broken. Both states block productive work.

Tuning loop: after each cycle, the reviewer's "next-cycle prompt-tuning notes" (concrete proposed prompt changes derived from the round's actual failures) get folded back into the generator + reviewer prompt templates for the next cycle. The cumulative-hard-rules list grows monotonically; rules earned from failures don't leave.
