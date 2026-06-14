---
name: signal-verdict
description: Runbook to take a new trading/ML/quant idea from hypothesis to an honest PROMOTE/PARK verdict — establish a real-data baseline, separate label/objective/verdict, TDD the pure pieces, build a real-data-gated benchmark harness, judge it on a walk-forward touched-once holdout with deflated-Sharpe/bootstrap discipline, and document everything. Use when testing a new signal, selector, exit/sizing policy, regime filter, or ML model for a strategy; when establishing a backtest baseline; when building a benchmark harness; or when the user mentions backtesting rigor, walk-forward validation, "does this beat baseline", PROMOTE/PARK, or invokes /signal-verdict.
---

# signal-verdict

A repeatable, falsify-first runbook for testing whether a **new idea actually makes a data strategy more
profitable** — without fooling yourself. It encodes the discipline that survived ADR-030/034–037 in the
XtbClient repo: **data first, TDD, real-data CI gate, label ≠ objective ≠ verdict, and a one-shot holdout.**

The default outcome of a rigorous test is **PARK**, not PROMOTE. That is the point: the runbook's job is to
cheaply kill bad ideas and to make the rare good one *trustworthy*. Most of the value is the negative results
it lets you record honestly.

## When to run it

A new idea exists: an ML algorithm, a selection rule, an exit/sizing/holding policy, a regime/exposure
overlay, a feature, a model. You want to know if it beats what's already shipped — and to leave an auditable
trail whether it wins or loses.

## The one rule that prevents the most expensive mistake

**Three things are separate; never collapse them.**

| Layer | What it is | Hard rule |
|---|---|---|
| **Label** | What counts as a "good" outcome | The realized net result under the **real production policy** (real fills, costs, stops). Not a clean toy target. |
| **Objective** | What a model/threshold optimizes | A calibrated / profit-weighted **probability loss**. **Never PnL. Never AUC.** Feature selection happens *inside* CV folds. |
| **Verdict** | What decides accept/reject | Walk-forward **OOS** ROI/Sharpe uplift vs baseline on a **touched-once holdout**, deflated for multiplicity. Any knob that responds to this number invalidates it. |

Judging by PnL is correct as a *verdict* and catastrophic as an *objective* — a PnL-tuned threshold has
near-unlimited power to fence off *this* sample's losers and will overfit even under purged CV.

## The runbook

Work top to bottom. Each phase has a Definition of Done; do not advance until it's met.

### Phase 0 — Frame the hypothesis (no code)
1. State precisely **which decision the idea changes**: universe / selection / entry / exit / horizon /
   sizing / exposure. (Different columns have very different leverage — measure the baseline before guessing.)
2. Write the **label**, **objective**, **verdict** for *this* idea per the table above.
3. **Leak audit**: every feature must come from the decision bar **D-1 and earlier**; the label from entry
   forward. List the inputs and confirm none touches the traded day. A single leaking feature manufactures a
   phantom edge with a beautiful in-sample curve — the most expensive false positive of all.
4. Declare the **trial budget** up front (every threshold/feature/model variant you'll try) — the deflation
   haircut scales to it. Append-only; a spent trial stays spent.
- **DoD:** a one-paragraph pre-registration (hypothesis, label, objective, verdict, leak audit, budget).

### Phase 1 — Establish the baseline on REAL data (skip only if one already exists)
1. Replay the **current production policy** over real retained history → labeled outcomes (deterministic).
2. **Decompose the P&L**: per-exit-reason, per-regime, win/loss asymmetry, and **tail concentration**
   (what share of return rides on the top-k trades). High tail concentration ⇒ a low **power floor** ⇒
   expect most ideas to PARK because the effect is undetectable at this effective N. Knowing this *before*
   searching saves weeks.
3. Record the baseline numbers with confidence intervals. **This is the bar every idea must beat.**
- **DoD:** a committed baseline report with CIs + a stated power floor / minimum detectable effect.

### Phase 2 — TDD the pure components (Red → Green → Refactor)
1. Anything pure (a feature extractor, an analyzer, a model wrapper, a backtester) gets unit tests **first**,
   on synthetic data with hand-computed expected values.
2. Every component ships a **leak-safety test** (asserts it reads only ≤ D-1 data) and, where it re-implements
   production behavior, a **golden-master parity test** (byte-identical to the incumbent on a fixture).
3. **Determinism is mandatory** — pin RNG seeds; for ML.NET SDCA set `NumberOfThreads=1` (parallel updates
   are non-deterministic even with a fixed seed). A non-reproducible harness cannot be a verdict.
- **DoD:** unit tests green; leak-safety + parity tests present; re-runs are byte-identical.

### Phase 3 — Build the real-data benchmark harness (the CI real-data gate)
1. The verdict runs against **real data, not mocks** — wire it as an integration test that connects to the
   real store, and **skip cleanly (Inconclusive) when no connection is configured** so CI without DB access
   passes silently. Mark it `[Explicit]` / a `Harness` category so it's opt-in, not in the default suite.
2. **Walk-forward, not random split**: train/select on the earlier block, confirm on a later **untouched**
   block. Purge/embargo around fold boundaries by the holding horizon.
3. Scale every haircut to **effective N** (autocorrelation-adjusted), not raw rows: **deflated Sharpe**,
   **CSCV/PBO**, **block-bootstrap CIs** on the paired daily-return difference vs baseline.
4. The harness **writes a deterministic markdown report** to a version-controlled path so the verdict is
   reviewable and re-runnable. See [HARNESS-TEMPLATE.md](HARNESS-TEMPLATE.md) for the skeleton.
- **DoD:** harness runs on real data, skips without it, emits a committed report, deterministic across runs.

### Phase 4 — Verdict (PROMOTE / PARK)
**PROMOTE** only if **all** hold on the touched-once holdout:
- Uplift CI vs baseline **clears zero**; **and** it beats a **same-skip/utilization random baseline** (so
  "uplift" isn't just the mechanical effect of trading less/differently); **and** it survives the deflation
  haircut and a **+50% cost-shock** stress; **and** it doesn't win by suppressing almost everything (a
  capital-utilization / absolute-PnL floor).

Otherwise **PARK** — and record it anyway, with the lead numbers. A "near-miss" (passes everything but the
CI straddles zero) is a PARK, not a soft promote. **Do not tune any threshold against the holdout margin.**

**The holdout is one-shot.** Once a fold is touched for confirmation it is *spent*; the next idea needs a
*fresh* untouched block (reserve recent months, or rely on forward/paper data). Reusing a spent holdout, or
running many ideas against it, is p-hacking — track cumulative multiplicity across the whole effort, not just
within one run.

### Phase 5 — Document everything (win or lose)
- An **ADR** for the decision (Context / Options / Decision / Consequences) — including the PARK ones; the
  recorded negatives are what stop the next person re-running a dead idea.
- The harness **report** under `docs/plans/...`; link it from the ADR; update the ADR index.
- Honest **caveats**: multiplicity, grid-boundary optima, regime-specific results, data-quality holes.
- A durable **memory/handoff** note so the next agent inherits the verdict, not just the code.

### Phase 6 — Deploy (only on PROMOTE, and only with explicit human authorization)
- Ship behind a **decorator / config, off by default**: `Off → Shadow (log would-be decisions, zero
  behavior change) → Active`.
- A **forward-shadow / paper period** must confirm the offline uplift on live fills **before real capital**.
- Flipping what production actually trades is **outward-facing and money-affecting** — confirm with the
  maintainer; never deploy on an automated prompt or to satisfy a metric. Reverting must be a one-line change.

## Hard prohibitions (the acceptance gate, enforced every phase)
- ❌ PnL or AUC as a training objective. ❌ Random train/test split on time-ordered rows. ❌ Any day-D
  feature. ❌ Mocked data for a verdict. ❌ Tuning on the holdout. ❌ Non-deterministic harness. ❌ Reusing a
  spent holdout. ❌ Deploying an unvalidated change to move a number.

## Anti-patterns this runbook exists to catch (seen in the wild)
- A classifier deployed by **AUC on a random split** of autocorrelated rows → incumbent literally worse than
  random. (Fix: chronological/purged split, calibrated objective, profit-aware selection.)
- A genetic optimizer maximizing **in-sample PnL** over a temporally-shuffled subsample → overfit parameters
  pasted into production. (Fix: out-of-fold walk-forward fitness on the harness.)
- A CV result that "clears the bar" but **PARKs on the holdout** because a random gate at the same skip rate
  did as well → the choice added no skill OOS. (This is the runbook working.)

## Reference implementation
XtbClient `docs/adr/ADR-030`, `ADR-034`–`ADR-037` and `docs/plans/adr-034/*` are a worked example: baseline
P&L decomposition, a policy backtester with golden-master parity, walk-forward holdout verdicts, a
learned-model diagnostic, and the resulting PROMOTE (tighter stop) / PARK (diversification, horizon,
learned primary pre-seed) records. Use them as templates for the artifacts each phase produces.
