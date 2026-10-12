---
name: fact-check
description: 'Verify disputed or load-bearing claims with a local experiment or two authoritative sources.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# fact-check

Ground load-bearing claims with evidence; never assert them from memory. Use on verification requests or when a wrong number, version, limit, contract, result, or factual claim would be costly. Skip trivial, low-stakes claims.

## The method — strongest evidence first

1. **Isolate falsifiable claims.** Replace vague language with concrete values. Split compound/abstract questions into independently verifiable claims, ground each, then answer the original question exactly. Fan out numerous independent claims to parallel agents and synthesize their evidence.
2. **Distinguish a measurement from a rate.** One observation establishes a moment, not a period. Check a second point for stability; prefer existing time series (artifacts, history, logs, backups). An `n=1` caveat does not justify treating a sample as a rate.
3. **Choose by claim type.** An executable claim is grounded only by running it and showing the real output; this branch wins when a run can settle the claim. Split mixed findings and report the grounded atoms:
   - **Executable:** run a minimal script/test and show actual output. Includes arithmetic, parsing, regexes, transforms, algorithms, library behavior, performance, encoding, null/overflow, async, and ordering. Source citations cannot substitute. Without a run, withhold the claim from findings and list **Not run**, with reason and settling command.
   - **Codebase, not executable:** inspect and cite exact `path:line` (commit-pinned if needed), or document + section. Examples: caller existence, documented contracts, unused symbols.
   - **Documentable, not executable:** consult primary sources for semantics, versions, limits, standards, or historical/scientific facts. Consequential or contested claims require at least two independent authoritative sources.
   - Use both an experiment and documentation when practical.
4. **Prefer authority:** primary specs/RFCs, official docs/source, standards bodies, datasets, papers; then reputable secondary references. For stable facts, follow Wikipedia citations to primary sources. Forums, blogs, Stack Overflow, and LLM output are leads, never proof.
5. **Attach evidence to every claim:** relevant deep URL (version-pinned for version-sensitive behavior), runnable snippet + actual output, or exact code citation. A generic/dead link, the artifact citing itself, or confidence from memory is not grounding.

## Confidence — state it, with its basis

| Status | Required basis |
|---|---|
| Confirmed (tested) | Local reproduction, snippet + actual output |
| Confirmed (sources) | At least two independent authoritative sources, both linked |
| Likely | One authoritative source, linked; flag the single point of failure |
| Unverified | Non-executable claim could not be grounded; do not assert as fact |
| Not run | Executable claim withheld; state reason and settling command |

## When sources conflict

Expose disagreement. Prefer authority and recency, noting date/version sensitivity. For executable claims, an experiment resolves the dispute and outranks documentation.

## Output

Per claim: **verdict · confidence · method · evidence**. For compound questions, one line per sub-claim followed by the composed answer. Match verification effort to stakes.
