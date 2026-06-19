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

## Adversarial code review (every code item)

The green test proves only what the implementer thought to assert. So after Green+Refactor, before commit/PR, a **fresh reviewer subagent that never sees the implementer's rationale** hunts the diff at extra-high recall for what the test missed; confirmed bugs get a regression test + fix in-item, pre-existing/out-of-scope ones get a follow-up issue. Protocol + hard rules: [CODE-REVIEW.md](CODE-REVIEW.md).

## Adversarial verification mode (verification-heavy items)

When an item's correctness depends on **claims about the world** a test runner can't check — web-sourced data, citations backing numeric claims, entity attributes (operators, owners, locations), historical figures — run **two-agent adversarial verification** instead of (or alongside) the code-review pass: a generator subagent produces candidate records, an independent reviewer subagent re-fetches every cited URL and audits each claim verbatim. The two MUST NOT share context — the reviewer's value is entirely its independence. Full protocol, prompt templates, and calibration: [ADVERSARIAL.md](ADVERSARIAL.md).

### Hard rules that transfer across projects

These are the project-agnostic adversarial-verification rules earned across actual cycles. Project-specific rules layer on top in the project's own skill.

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

11. **Knowledge-graph entity-typing reflex check (when a Wikidata-only or similar KG-only path is accepted).** Before trusting a knowledge-graph QID/URI that lacks a Wikipedia article (or equivalent first-class source), verify the entity's `instance-of` (P31 in Wikidata) is the expected resource class. A QID returning `instance-of` taxon, asteroid, painting, software, airport, aerodrome, or similar name-collision targets — or auto-import-corrupted values — is a name-collision and the KG-only path fails. *Conversely:* P31 ABSENCE is not disqualifying when independent identifier corroborators (e.g. GeoNames + matching narrative + matching coordinate) confirm the entity.

12. **Exact-zero-drift on round numbers across sources = derivative reporting, not independent corroboration.** When two sources publish the same magnitude with zero decimal drift on a round number (5,700 = 5700.0; 17,000 = 17000.0), this is a fingerprint of shared upstream sourcing — a press release, a regulator's filing, or a single primary database — mirrored by both downstream sources. These are NOT independent corroborators. The match satisfies rule 2's category check but fails the spirit of independence. Hold at the lower confidence tier unless a third independent allowlisted authority publishes the same figure.

13. **Quoted strings in narrative `notes` must appear verbatim on a cited URL** (or be paraphrased without quote marks). Decorative quotation invites cycle-to-cycle confirmation drift: a future reviewer reading the notes treats the quoted string as already-verified ground truth, but no cited source actually contained it. This extends rule 1 to qualitative claims.

14. **Wayback / web-archive URLs may require non-WebFetch fetch methods.** When a Wayback URL (`web.archive.org/web/...`) returns garbled bytes, is blocked at the WebFetch tool layer, **returns an empty body where curl returns content cleanly**, or returns content with a UTF-16LE BOM (`FF FE`), fall back to `curl -s -L "<url>"` via Bash — optionally piped through `iconv -f UTF-16LE -t UTF-8` if the BOM signals UTF-16. Do NOT skip a cited Wayback URL because WebFetch fails; rule 7 (trust-but-verify) gets no Wayback exemption — pivot the fetch method, don't drop the URL. **Crucially: a Wayback URL returning empty / "no content" via WebFetch is NOT proof the snapshot is missing — curl may return tens of kilobytes of valid HTML from the same URL.** A prior cycle's "exhaustive WebFetch search, all empty" is therefore not a true exhaustion — a curl retry is mandatory before declaring `blocked-on-question` on Wayback-thin data. The operative retry mechanism is the fetch-method difference (curl vs WebFetch); the `iconv` decode is secondary.

15. **Publisher-asserted rebrand-equivalence for row-redefinition.** When a primary source consolidates or splits its own data rows mid-series, citing the post-consolidation row for the pre-consolidation entity is acceptable ONLY IF: (a) the publisher itself asserts the rebrand-equivalence verbatim (not the reviewer inferring it); (b) the rebrand is acknowledged as a SCOPE CHANGE — every post-rebrand entry's `notes` MUST annotate the date and the components added/removed; (c) the dominant component of the new aggregate is still the original entity. The discontinuity at the rebrand-boundary must NEVER be presentable as real entity-level change — the value-step is publisher-bookkeeping, not the world changing. Canonical example: EIA's Dec-2017 DPR consolidation of "Marcellus" and "Utica" into a single "Appalachia" row produced a +60% value-step (19,322 → 31,037 MMcf/day) at the row boundary; without the annotation, that step would mislead a reader as a real production surge.

16. **Source-survey pre-commitment check before pivoting onto a primary publisher's country/sector brief.** Before committing to a multi-vintage publisher brief (EIA Country Analysis Briefs, IEA country profiles, USGS Mineral Commodity Summaries) as the SPINE of a sweep, sample-fetch (a) the live brief AND (b) at least one Wayback capture from the target year range. If the live brief is a thin stub (<20 KB or 0 mentions of the target entity) AND Wayback captures are similarly thin, **abort the brief pivot — the publisher likely never structurally covered this entity at depth**. Two recovery paths before giving up: (i) pre-rebrand domain captures via curl per rule 14 (e.g. `eia.doe.gov/emeu/cabs/<country>.html` survives deeper than modern `eia.gov` captures); (ii) older Wayback URL patterns the modern site no longer serves. The lesson is **pre-check, don't pre-assume**: a brief that covers one entity at depth doesn't guarantee the next is — confirm per-entity before adopting it as the spine.

    **Failure-shape taxonomy (rules 16 + 17 unified).** Before pivoting onto a publisher's brief as the spine, classify the failure risk:

    | # | Shape | Diagnostic | Recovery |
    |---|---|---|---|
    | 16-main | Thin stub (live + Wayback both <20KB / 0 mentions) | publisher dropped the entity entirely | Pivot to GEM Wiki + Wikipedia |
    | 16-c1 | `tbd` / null-cell across vintages (row present, cell empty) | publisher acknowledges entity but never received figures | Same as thin-stub |
    | 16-c2 | Country-aggregate-only (never breaks out fields) | Wayback returns country narrative + 0 field mentions across vintages | Pivot to Wikipedia/GEM single-figure-stubs |
    | 16-c3 | Per-field 1-vintage-only | grep for the entity returns exactly 1 numeric hit across ~10 vintages | Accept 1-2 entries; honest result |
    | 16-c4 | Firm-policy redacted (sub-area rates withheld) | a third-party reserves table / 10-K confirms rows exist but `production` is blank | No recovery without firm-publication allowlist extension |
    | 17-main | Discontinued product (Wayback "Next Release Date: Discontinued") | recurring product paused; prior vintages canonical, no extension forward | Use pre-discontinuation vintages; expect a gap |
    | 17-c1 | Table removed from newer vintages (silent scope-cut) | grep returns hits in older vintages, 0 in newer | Use pre-removal vintages; expect a gap |
    | 16-c5 | Vintage-windowed coverage | grep finds entity in vintage range [X, Y]; none outside | Use the window's hits; bounded coverage |
    | 16-c6 | Entity never produced commercially | Wikipedia/USGS/Wikidata describe it as PFS / exploration / "proposed"; resource-estimate ≠ production | Ship empty-entries sidecar with "never-produced" note; rule 2 forbids citing PFS/reserves as production |

    Rules 16+17 share the operational outcome: when the spine fails at any shape, pivot to GEM Wiki + Wikipedia + portfolio articles and accept an honest 0-3 entry result rather than padding. The shapes differ in *diagnostic signature*, not in what to do — knowing the shape lets the source-survey terminate faster.

17. **Publisher-product lifecycle ≠ publisher viability.** A publisher (EIA, USGS, IEA, BP, IHS) may stay trusted while specific *products* are discontinued, renamed, or scope-reduced. When a sweep's spine relies on a specific recurring product, the rule-16 sample-fetch must also check the product's "Next Release Date" / last-update marker — a discontinued product has a hard endpoint past which no vintages exist. Prior-vintage captures stay valid for the years they covered (subject to rule 14), but **cannot be extrapolated forward** by citing a later snapshot of a *different* product as "the publisher still publishes this" — a category-mismatch (rule 2) under the cover of "same publisher". A shorter honest result bounded to the years the product actually covered beats a padded one that splices in a category-mismatched product. When a sweep crosses a known product-lifecycle boundary, expect a coverage gap rather than padding.

    **Corollary — table-removed-from-newer-vintages (silent scope-cut).** Distinct from "discontinued product" (whole product gone) and the `tbd` corollary (cell present but null): the publisher *continues* the brief but *removes the table* in a later vintage. Old vintages stay canonical for their years; new vintages won't extend forward. Tell: grep finds the entity's table in older vintages (sometimes only via curl + UTF-16LE iconv per rule 14) but absent from later ones while the brief ships on. Treat as discontinued for the dropped table; bound the year-span at the last vintage that carried it.

18. **Sibling-fetch reuse on a proven regional spine.** When a multi-vintage publisher brief is confirmed (per rule 16) as a working spine for one entity in a region, later items targeting other entities in the same region SHOULD start by reading the prior item's review-log "Inputs" section for the exact URL list of vintages that returned content — then **independently re-fetch every URL per rule 7** (no scratchpad inheritance, no trust transfer). Cuts the source-survey from ~20 min to ~5. Critical: the reviewer treats the re-fetched URLs as first-time discoveries (fresh fetch into a separate scratchpad, body-text grep for the verbatim anchors) — rule 7 is what distinguishes sibling-fetch reuse from trust-chain corruption. **The sibling-fetch URL list is itself a deliverable** — every review log under a publisher spine MUST carry an "Inputs" section listing the URLs that returned content. Failure mode: sibling-fetch does NOT extend a spine that doesn't already cover the sibling at depth (the brief may carry a region's primary entities but only `tbd` cells for secondary ones) — it reuses a working spine, it doesn't repair a broken one.
