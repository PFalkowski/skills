# NightShift — Adversarial verification mode

For backlog items where correctness depends on **claims about the world** rather than on a unit test compiling and passing. Two subagents with no shared context — generator drafts, reviewer adversarially re-fetches every cited source.

The default LOOP.md flow is single-agent TDD. Use this mode instead when an item involves data fetched from web sources, citations supporting numeric claims, or entity attributes that only WebFetch can verify.

## When to use this mode

A backlog item warrants adversarial mode when **at least one** is true:

- The deliverable is a JSON / YAML / Markdown record with claims sourced from external URLs.
- A failure mode includes hallucination: fabricated coordinates, plausible-but-fictional numbers, entity names lifted from training context rather than from cited sources.
- The unit-test signal is weak — the test runner can confirm "the JSON is well-formed" but cannot confirm "the cited URL actually says what we claim".
- A wrong claim landing has higher cost than the latency of running a second subagent.

If none apply, use the default single-agent LOOP.

## Per-item flow

```
1. Read backlog. Find first [pending] item. Confirm "adversarial mode"
   applies (otherwise drop back to LOOP.md).

2. Atomically: change [pending] → [in_progress], append "started: <ISO>"
   to Run log.

3. Plan (2–3 sentences in Run log):
   - What N candidates the generator should produce.
   - What "accept / downgrade / reject" criteria the reviewer should
     apply.
   - The project-specific source-allowlist or quality bar that gates
     both subagents.

4. GENERATE — spawn the generator subagent (fresh context, WebFetch +
   WebSearch enabled). Prompt template below.

5. After generator returns, sanity-check that:
   - N proposals (or fewer, with explicit drop reasons) sit in the
     staging dir.
   - The validator / linter for the project's data shape passes on
     each proposal.
   - The generator's self-rated confidence and source-list look honest.

   If the generator's output is incoherent or its proposals fail the
   validator, this is a "RED for the wrong reason" — pivot or mark
   blocked-on-question per LOOP.md retry budget.

6. REVIEW — spawn the reviewer subagent (fresh context, NO access to
   the generator's research). Prompt template below.

7. After reviewer returns:
   - Move accepted / downgraded files to canonical paths (the reviewer
     usually does this, but verify).
   - Record BOTH the rejection rate AND the downgrade rate.
   - Read the reviewer's "tuning notes" — these update the next
     cycle's prompts.

8. Commit (if policy=yes). Single conventional message; the proposals
   may be many files but they're one logical deliverable per item.

9. Mark item [done], append rejection / downgrade rates + wall-clock
   to Run log.

10. Hand off to next item per LOOP.md "Context management".
```

The two subagent steps (5 and 7) replace the single Red-Green-Refactor cycle of the default LOOP. Refactor is rarely meaningful in this mode — the work product is data records, not code.

## Generator prompt template

Substitute `{N}`, `{category}`, `{staging_dir}`, `{quality_bar_doc}`, `{existing_records}`, `{cumulative_hard_rules_section_or_link}`. Keep the prompt self-contained — the subagent has no conversation history.

```
You are the GENERATOR for an autonomous adversarial-verification cycle.
Your output goes to a separate REVIEWER subagent that has NOT seen
your research, and the reviewer is adversarial — fabricated or
under-cited records get rejected and the rejection rate is reported
to the user as your failure rate.

Authoritative spec: read {quality_bar_doc} end-to-end before starting.

Cumulative hard rules earned across prior cycles:
{cumulative_hard_rules_section_or_link}

Task: produce {N} {category} records that meet the quality bar.
Existing records to skip (no duplicates): {existing_records}.

For each candidate:

1. Identify the candidate. Confirm it isn't already covered by an
   existing record.

2. Fetch primary-source URLs that support the claims. The exact set of
   "primary" sources is project-specific — the quality-bar doc names
   them.

3. Verbatim-quote pre-flight: for every numeric value you intend to put
   in a structured field, paste in your scratchpad the exact sentence
   from a cited URL that contains that number. If no cited URL
   contains the value, drop the field.

4. Cross-source category audit: when you have two figures from
   different sources for the "same" claim, quote the CATEGORY label
   from each source verbatim. Match requires identical category, not
   just identical number.

5. Intra-source contradiction check: scan each source for self-
   contradictions (e.g. infobox vs lede with different numbers). If
   present, flag in notes and degrade confidence.

6. Source-precision honesty: don't over-claim a source's precision in
   the source label. If Wikidata gives degree-minute, don't paraphrase
   to sub-decimal seconds.

7. Entity-name attributions: only set entity-name fields (operator,
   owner, manufacturer) when the name appears verbatim on a cited URL.
   Substring + rebrand-equivalence accepted (e.g. "Total" ⇆
   "TotalEnergies" post-2021). When sources disagree, use 2-of-3
   majority with rebrand-equivalence; null only when all distinct.

8. Self-rate confidence honestly. The cumulative hard rules define
   the confidence ladder for this project. If only one source backs a
   claim, the rating cannot be the multi-source tier.

9. Write the record to {staging_dir}/<id>.json (or the project's
   convention).

10. Run the project validator against the staging dir. It must exit 0
    (or with only the project's accepted warnings).

Hard rules (in addition to {cumulative_hard_rules_section_or_link}):
- Never invent values not present in any cited URL.
- Never cite a homepage. Cite the exact page that supports the claim.
- Never cite a domain outside the project allowlist.
- When in doubt, ship at the most-conservative confidence tier rather
  than fabricate.

Deliverable (printed to stdout AND written to {staging_dir}):
- Summary table per candidate: id | <project-specific cols> | confidence | source-domains | category-label-verbatim
- Path to every record file written
- Project validator output (exit code required)
- For each rejected candidate, a one-line reason (the rejection log
  is training data for the next cycle's generator prompt)

Do NOT commit. Do NOT push. The reviewer subagent runs next.
```

## Reviewer prompt template

```
You are the REVIEWER for an autonomous adversarial-verification cycle.
A generator subagent (which you have NOT seen) drafted N records under
{staging_dir}. Your job is adversarial verification via independent
WebFetch on every cited URL.

Authoritative spec: read {quality_bar_doc} end-to-end. Cumulative
hard rules: {cumulative_hard_rules_section_or_link}.

Hard rule: WebFetch on every cited URL. No heuristic shortcuts. No
skipping URLs because "this domain is reliable". The two-agent
pattern's value is independence — go back to ground truth.

For each record:

1. Read the record file.

2. WebFetch every URL in the source list. The page must return 200 OK
   and the body text must support the claim it is cited for. Quote
   the exact paragraph or table cell when verifying numeric figures.

3. Re-resolve any independently-checkable attributes (centroids,
   timestamps, entity attributes) against primary sources. Apply the
   project-specific tolerance thresholds.

4. Verbatim-quote audit (cumulative hard rule 1): for every numeric
   value in a structured field, locate the verbatim sentence on a
   cited URL containing that number. If the value is not on any cited
   URL, REJECT or drop the field. This is the single highest-yield
   adversarial check.

5. Category-match audit (cumulative hard rule 2): for any record
   self-rated above the lowest tier, verify both magnitude sources
   publish the SAME category label (not just same number). Downgrade
   if the categories differ.

6. Intra-source contradiction audit (cumulative hard rule 3): if the
   generator missed a self-contradiction in one of the cited sources,
   flag and downgrade.

7. Entity-name verbatim audit (cumulative hard rule 5): if an entity-
   name field is set, the name must appear verbatim on at least one
   cited URL (substring + rebrand-equivalence OK). Otherwise null
   the field.

8. Re-run the project validator independently. The record must pass.

9. ACCEPT if every check passes — move the record from {staging_dir}
   to the canonical location.

   DOWNGRADE if a check forces stricter rating but data is correct —
   edit confidence + extend notes; move to canonical.

   REJECT otherwise — delete the file, append a one-line reason to
   {staging_dir}/_rejected.log, re-run the validator.

You may NOT shortcut by trusting the generator. Every URL gets fetched.

Deliverable (printed to stdout):
- A row per record: id | accept|downgrade|reject | reason (verbatim
  quote where load-bearing)
- Final canonical-directory listing (so the user sees what survived)
- _rejected.log contents (if any)
- Project validator output post-decisions
- Tuning notes for next cycle: concrete proposed prompt changes derived
  from this round's actual failures. The cumulative hard-rules list
  grows monotonically — rules earned from failures don't leave.
```

## Calibration signals

Track these per cycle and per item:

- **Rejection rate** = rejected / proposed. Rule of thumb: <10% over a sustained run means the reviewer is too lenient. >80% means the generator is broken. Either state blocks productive work.

- **Downgrade rate** = downgraded / proposed. This is the *quieter* but *more sensitive* signal. A cycle with 0 rejections but 4 downgrades (medium → estimated, reserves dropped, operator nulled, etc.) is NOT a free-pass cycle — those downgrades are real quality interventions and should drive next-cycle prompt-tuning.

- **Drop rate at generator** = generator-self-dropped / generator-attempted. Tracks how often the generator hits the project's source-allowlist or threshold rules. Large numbers (e.g. 14 of 17 attempted) mean the project's gap-list has shifted ahead of where allowlisted sources cover.

A round that lands 3-of-3 accepted with 1 downgrade is a productive round. A round that lands 0-of-3 because the generator hit allowlist gaps is a signal to expand the allowlist (a separate ADR-class decision).

## Fold-back to the rules (mandatory before exit)

The reviewer's "next-cycle prompt-tuning notes" are the active output of this pattern — more important than the per-item accept/reject decisions, because they compound. Each round earns 2-6 concrete proposed rule changes; if they only land in the per-run markdown file, they're read once by the morning reviewer and forgotten by the time the next cycle runs. The next generator and reviewer would re-discover the same lessons from scratch.

**Before the run exits, fold the observations into the right skill file.** This is step 1 of LOOP.md's "Exit + summary" section — restated here because adversarial-mode runs are the most lesson-dense and miss this most often.

The split:
- **Project-specific rules** stay in the project skill (the one whose data shape, source allowlist, or domain conventions the rule references). New numbered rules go in the "Cumulative hard rules" section; sub-bullets clarifying existing rules go under the parent rule.
- **Project-agnostic rules** go into this generic skill — `SKILL.md` "Hard rules that transfer across projects" for top-level lessons, `ADVERSARIAL.md` for adversarial-mode-specific lessons.
- **Worked examples** (what failed, how the rule caught it the next round) belong in the project skill's run-history table — they keep the generic skill project-neutral.

The cumulative-rules list grows monotonically. Rules earned from failures don't leave; the generator and reviewer prompts pick them up automatically on the next cycle because the prompts read the SKILL file fresh each time.

A pragmatic test: if your exit summary says "6 tuning observations surfaced this run" but the `Folded into skills` line is empty, you've left 5 of them on the floor. Fold them. It's two file edits and a commit per skill touched.

## Anti-patterns

- **Sharing context between generator and reviewer.** If the reviewer reads the generator's rationale, it inherits the generator's confirmation bias. Spawn fresh.
- **Skipping URLs in the reviewer pass.** "This domain is reliable" defeats the whole pattern.
- **Reviewer rubber-stamps without re-fetching.** Visible signal: reviewer reports verdict without quoting verbatim source text. If the reviewer can't quote, it didn't fetch.
- **Generator over-rates confidence to please the reviewer.** Visible signal: the cycle's downgrade rate climbs above 50%. The fix is in the generator prompt's confidence-ladder section, not the reviewer prompt.
- **Allowing the generator to "fix" failed proposals by editing the validator or quality-bar doc.** Hard rule: the generator works against the rules as published; only the user changes the rules.
- **Letting `_rejected.log` reasons drift to "no good".** Each rejection deserves a specific reason — that text is the next cycle's generator prompt input.

## Project examples

This pattern was developed in the GeopoliticsSim repo's
`resource-deposit-backfill` skill (cycle 2026-05-10, rounds 1+2+3,
27 records added across oil/gas/REE deposits with 5 reviewer
interventions). Read that project's SKILL.md "Cumulative hard rules"
section for an example of how project-specific rules layer on top of
the project-agnostic rules in this file.
