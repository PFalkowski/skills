---
name: signal-verdict
description: 'Evaluate a trading/ML signal, model or backtest baseline on walk-forward holdouts; return PROMOTE or PARK.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# signal-verdict

Default to **PARK** unless a deterministic, real-data test earns **PROMOTE**. Work phases in order; meet each Definition of Done (DoD) before advancing.

## The one rule that prevents the most expensive mistake

Keep three layers separate:

| Layer | Rule |
|---|---|
| Label | Realized net outcome under actual production fills, costs, and stops |
| Objective | Calibrated/profit-weighted probability loss; never PnL or AUC. Feature selection stays inside CV folds |
| Verdict | Walk-forward OOS ROI/Sharpe uplift versus baseline on a touched-once holdout, deflated for multiplicity. No knob may respond to it |

PnL is a verdict, never a threshold-training objective, even with purged CV.

## The runbook

### Phase 0 — Frame the hypothesis (no code)

State the decision changed (universe/selection/entry/exit/horizon/sizing/exposure), label, objective, and verdict. Audit all features: decision bar **D-1 or earlier**, labels from entry onward; no traded-day inputs. Declare every threshold/feature/model trial up front; the trial ledger is append-only and spent trials remain counted.

**DoD:** one-paragraph preregistration covering hypothesis, three layers, leak audit, and trial budget.

### Phase 1 — Establish the baseline on REAL data (skip only if one already exists)

Deterministically replay current production policy on real retained history. Decompose P&L by exit reason, regime, win/loss asymmetry, and top-k trade tail concentration. Concentrated returns lower effective sample size and power. Record baseline confidence intervals and minimum detectable effect.

**DoD:** committed baseline report with CIs and power floor, used as every idea's comparison.

### Phase 2 — TDD the pure components (Red → Green → Refactor)

Test pure features, analyzers, wrappers, and backtesters first using synthetic fixtures with hand-computed expectations. Every component needs a leak-safety test (reads only ≤ D-1); production reimplementations also need byte-identical golden-master parity. Pin RNG seeds and disable nondeterministic training parallelism (e.g. ML.NET SDCA `NumberOfThreads=1`).

**DoD:** tests green, leak/parity assertions present, reruns byte-identical.

### Phase 3 — Build the real-data benchmark harness (the CI real-data gate)

Use an opt-in integration test against the real store, never mocked verdict data. Skip cleanly without a configured connection so ordinary CI passes; use an explicit category/flag (e.g. NUnit `[Explicit]` + `Inconclusive`, pytest marker, Go build tag).

Train/select on earlier blocks; confirm on later untouched blocks. Purge/embargo boundaries by holding horizon; never randomly split temporal rows. Scale deflated Sharpe, CSCV/PBO, and block-bootstrap CIs for paired daily-return differences to autocorrelation-adjusted **effective N**.

Write deterministic markdown to a version-controlled path using [HARNESS-TEMPLATE.md](HARNESS-TEMPLATE.md).

**DoD:** real-data run succeeds, missing connection skips, committed report and reruns are deterministic.

### Phase 4 — Verdict (PROMOTE / PARK)

**PROMOTE** requires all of:

- Uplift CI clears zero versus baseline.
- Beats a same-skip/utilization random baseline.
- Survives multiplicity deflation and **+50% cost shock**.
- Meets capital-utilization/absolute-PnL floor; cannot win by suppressing nearly all trading.

Otherwise **PARK**, including near misses whose CI crosses zero; record lead numbers. Never tune against the holdout margin. A confirmation fold is spent after one use: the next idea requires fresh untouched history or forward/paper data. Track multiplicity across the entire effort, not merely one run.

### Phase 5 — Document everything (win or lose)

Write an ADR (Context / Options / Decision / Consequences), including PARK decisions; link the committed harness report and update the ADR index. Record multiplicity, grid-boundary optima, regime sensitivity, and data-quality gaps. Leave a durable memory/handoff note carrying the verdict.

### Phase 6 — Deploy (only on PROMOTE, and only with explicit human authorization)

Use an off-by-default decorator/config: **Off → Shadow** (log would-be decisions, no behavior change) **→ Active**. Forward-shadow/paper results must confirm uplift on live fills before real capital. Confirm money-affecting production changes with the maintainer; never deploy from an automated prompt or to move a metric. Reversion must be one line.

## Hard prohibitions (the acceptance gate, enforced every phase)

No PnL/AUC training objective, random temporal split, day-D feature, mocked verdict, holdout tuning/reuse, nondeterministic harness, or deployment of unvalidated changes.

## Reference implementation

Per-phase artifacts: baseline P&L decomposition, parity-tested policy backtester, walk-forward holdout verdict, learned-model diagnostic, and PROMOTE/PARK ADRs with backing reports.
