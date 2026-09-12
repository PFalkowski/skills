---
name: hunt-token-actuals-first-party
description: An 8-lens hunt with refuters cost ~850k tokens across 14 agents — the 40k/lens reserve is far too low
type: calibration
---

Measured on the first hunt of this repo (2026-09-04), over a 70-file one-week delta:

| | |
|---|---|
| Lenses | 8 — secrets, injection, exposure, supply-chain, docs, insecure-design, logic, correctness |
| Agents completed | 14 (8 hunters, plus refuter triples on the surviving candidates) |
| Agents returning empty | 6 |
| Total subagent tokens | 849,729 |
| Wall clock | ~250 s |
| Tool calls | 98 |

That is roughly **60k tokens per agent**, and roughly **106k per lens** once refuters are counted
against the lens whose candidates they judged. The `reserve: 40000` per lens carried in the
dispatch is therefore **under half** of what a lens with findings actually costs; it only held here
because the budget was nowhere near exhausted.

Two consequences for sizing a wave: budget an eight-lens party at ~850k rather than ~320k, and
expect a hunt with more surviving candidates to cost *more* than this one — six of the fourteen
agents returned nothing and so spawned no refuters at all.
