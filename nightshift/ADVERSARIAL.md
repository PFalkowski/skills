# NightShift — Adversarial source-verification mode (optional)

For the minority of backlog items where correctness depends on **claims about the world** rather than on a unit test compiling and passing. Two subagents with no shared context — a generator drafts, a reviewer adversarially re-fetches every cited source.

The default second pass for code items is [CODE-REVIEW.md](CODE-REVIEW.md). Use *this* mode instead when an item's main risk is external-fact accuracy: data copied from web sources or docs, citations supporting numeric claims, version/compatibility facts, or entity attributes that only a fetch can verify. Most items are code and never need this mode.

## When to use this mode

A backlog item warrants source-verification mode when **at least one** is true:

- The deliverable is a structured record (JSON / YAML / Markdown / config) whose values are claimed from external sources.
- A failure mode includes hallucination: fabricated numbers, plausible-but-fictional values, names recalled from training context rather than read from a cited source.
- The test signal is weak — the runner can confirm "the output is well-formed" but cannot confirm "the cited source actually says what we claim".
- A wrong claim landing costs more than the latency of running a second subagent.

If none apply, use the default code-review pass (or plain LOOP for items with no external facts).

## Per-item flow

```
1. Read backlog. Find first [pending] item. Confirm "source-verification
   mode" applies (otherwise drop back to CODE-REVIEW.md / LOOP.md).

2. Atomically: change [pending] → [in_progress], append "started: <ISO>"
   to Run log.

3. Plan (2–3 sentences in Run log):
   - What N candidates the generator should produce.
   - What "accept / downgrade / reject" criteria the reviewer should
     apply.
   - The project-specific source-allowlist or quality bar that gates
     both subagents.

4. GENERATE — spawn the generator subagent (fresh context, fetch tools
   enabled). Prompt template below.

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

2. Fetch the source URLs that support the claims. The exact set of
   acceptable sources is project-specific — the quality-bar doc names
   them.

3. Verbatim-quote pre-flight: for every value you intend to put in a
   structured field, paste in your scratchpad the exact sentence from
   a cited URL that contains that value. If no cited URL contains the
   value, drop the field.

4. Cross-source meaning audit: when you have two values from different
   sources for the "same" claim, quote the LABEL / definition from each
   source verbatim. A match requires the same meaning, not just the
   same number.

5. Intra-source contradiction check: scan each source for self-
   contradictions (e.g. a summary and a detail table giving different
   values). If present, flag in notes and degrade confidence.

6. Source-precision honesty: don't over-claim a source's precision in
   the source label. If a source publishes a rounded or low-precision
   value, don't present it at finer precision.

7. Entity-name attributions: only set entity-name fields (owner, author,
   vendor, maintainer) when the name appears verbatim on a cited URL.
   Substring + rebrand-equivalence accepted (e.g. "Facebook" ⇆ "Meta"
   post-2021). When sources disagree, use majority with rebrand-
   equivalence; null only when all are distinct.

8. Self-rate confidence honestly. The cumulative hard rules define the
   confidence ladder for this project. If only one source backs a claim,
   the rating cannot be the multi-source tier.

9. Write the record to {staging_dir}/<id>.json (or the project's
   convention).

10. Run the project validator against the staging dir. It must exit 0
    (or with only the project's accepted warnings).

Hard rules (in addition to {cumulative_hard_rules_section_or_link}):
- Never invent values not present in any cited URL.
- Never cite a homepage. Cite the exact page that supports the claim.
- Never cite a source outside the project allowlist.
- When in doubt, ship at the most-conservative confidence tier rather
  than fabricate.

Deliverable (printed to stdout AND written to {staging_dir}):
- Summary table per candidate: id | <project-specific cols> | confidence | source-domains | label-verbatim
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
fetches of every cited URL.

Authoritative spec: read {quality_bar_doc} end-to-end. Cumulative
hard rules: {cumulative_hard_rules_section_or_link}.

Hard rule: re-fetch every cited URL. No heuristic shortcuts. No
skipping URLs because "this domain is reliable". The two-agent
pattern's value is independence — go back to ground truth.

For each record:

1. Read the record file.

2. Fetch every URL in the source list. The page must return 200 OK
   and the body text must support the claim it is cited for. Quote
   the exact sentence or table cell when verifying a value.

3. Re-resolve any independently-checkable attributes (timestamps,
   identifiers, entity attributes) against primary sources. Apply the
   project-specific tolerance thresholds.

4. Verbatim-quote audit (hard rule 1): for every value in a structured
   field, locate the verbatim sentence on a cited URL containing that
   value. If the value is not on any cited URL, REJECT or drop the
   field. This is the single highest-yield adversarial check.

5. Meaning-match audit (hard rule 2): for any record self-rated above
   the lowest tier, verify the corroborating sources publish the SAME
   label/definition (not just the same number). Downgrade if they
   differ.

6. Intra-source contradiction audit (hard rule 3): if the generator
   missed a self-contradiction in one of the cited sources, flag and
   downgrade.

7. Entity-name verbatim audit (hard rule 5): if an entity-name field is
   set, the name must appear verbatim on at least one cited URL
   (substring + rebrand-equivalence OK). Otherwise null the field.

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

- **Downgrade rate** = downgraded / proposed. This is the *quieter* but *more sensitive* signal. A cycle with 0 rejections but 4 downgrades (confidence lowered, a field dropped, an attribute nulled, etc.) is NOT a free-pass cycle — those downgrades are real quality interventions and should drive next-cycle prompt-tuning.

- **Drop rate at generator** = generator-self-dropped / generator-attempted. Tracks how often the generator hits the project's source-allowlist or threshold rules. Large numbers (e.g. 14 of 17 attempted) mean the project's gap-list has shifted ahead of where allowlisted sources cover.

A round that lands 3-of-3 accepted with 1 downgrade is a productive round. A round that lands 0-of-3 because the generator hit allowlist gaps is a signal to expand the allowlist (a separate ADR-class decision).

## Fold-back to the rules (mandatory before exit)

The reviewer's "next-cycle prompt-tuning notes" are the active output of this pattern — more important than the per-item accept/reject decisions, because they compound. Each round earns 2-6 concrete proposed rule changes; if they only land in the per-run markdown file, they're read once by the morning reviewer and forgotten by the time the next cycle runs. The next generator and reviewer would re-discover the same lessons from scratch.

**Before the run exits, fold the observations into the right skill file.** This is step 1 of LOOP.md's "Exit + summary" section — restated here because source-verification runs are the most lesson-dense and miss this most often.

The split:
- **Project-specific rules** stay in the project skill (the one whose data shape, source allowlist, or domain conventions the rule references). New numbered rules go in the "Cumulative hard rules" section; sub-bullets clarifying existing rules go under the parent rule.
- **Project-agnostic rules** go into this generic skill — `SKILL.md` "Source-verification rules that transfer across projects" for top-level lessons, `ADVERSARIAL.md` for mode-specific lessons.
- **Worked examples** (what failed, how the rule caught it the next round) belong in the project skill's run-history table — they keep the generic skill project-neutral.

The cumulative-rules list grows monotonically. Rules earned from failures don't leave; the generator and reviewer prompts pick them up automatically on the next cycle because the prompts read the SKILL file fresh each time.

A pragmatic test: if your exit summary says "6 tuning observations surfaced this run" but the `Folded into skills` line is empty, you've left 5 of them on the floor. Fold them. It's two file edits and a commit per skill touched.

## Backfilling a historical series (when an item is "fill historical data")

A common shape: an item asks you to backfill a multi-period series of values for a single entity (figures per year, prices per quarter, counts per release, etc.). The adversarial pattern works the same way as for single-record items, with two specific sub-patterns:

**Periodic-edition publication pattern.** When a publisher releases the same table structure every period (an annual report, a versioned spec, dated release notes, an archived dashboard), series backfill is high-leverage: walk back through editions and extract each period's reference cell verbatim. Document the URL pattern in the generator prompt — periodic publications are the cheapest cross-period corroboration source.

**Two strategies, in order of preference:**
- **Strategy A — per-entity verbatim.** Each period's value comes from a source page that names the specific entity and the specific period. Highest fidelity; requires the publisher to break the entity out by period.
- **Strategy B — aggregate-fractioned.** When per-entity period figures don't exist, take an aggregate and apply a citable fraction (e.g. a total × the entity's documented share). The fraction itself MUST come from a verbatim quote on a cited URL — without one, you cannot use Strategy B and must fall back to A. Each entry's notes must mark the fraction value + its citation, so a future auditor can trace what's verbatim and what's derived.

Mixing per-period is acceptable: some periods from A, others from B, with each entry's notes naming its strategy.

**Rule-honest entry counts.** A "≥10 entries spanning the full history" goal is aspirational, not a floor. The hard floor is rule 1 (verbatim-quote pre-flight). Three verbatim-cited entries beat ten inferred ones. If the publisher only stamps two figures across a long history, ship those two — don't interpolate. The goal is what you can defend, not what you can fabricate.

## Anti-patterns

- **Sharing context between generator and reviewer.** If the reviewer reads the generator's rationale, it inherits the generator's confirmation bias. Spawn fresh.
- **Skipping URLs in the reviewer pass.** "This domain is reliable" defeats the whole pattern.
- **Reviewer rubber-stamps without re-fetching.** Visible signal: reviewer reports a verdict without quoting verbatim source text. If the reviewer can't quote, it didn't fetch.
- **Generator over-rates confidence to please the reviewer.** Visible signal: the cycle's downgrade rate climbs above 50%. The fix is in the generator prompt's confidence-ladder section, not the reviewer prompt.
- **Allowing the generator to "fix" failed proposals by editing the validator or quality-bar doc.** Hard rule: the generator works against the rules as published; only the user changes the rules.
- **Letting `_rejected.log` reasons drift to "no good".** Each rejection deserves a specific reason — that text is the next cycle's generator prompt input.

## Layering project-specific rules

The project-agnostic rules in this file are the base. A project that runs
this pattern keeps its own rules — data-source allowlists, entity-typing
conventions, field-vs-derived distinctions, and similar domain specifics —
in a "Cumulative hard rules" section of that project's own SKILL.md,
layered on top. Keep the two tiers separate so this file stays
transferable across projects.
