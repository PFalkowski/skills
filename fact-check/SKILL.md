---
name: fact-check
description: Ground any claim you need confidence in before relying on it, using the strongest evidence available — run a quick local experiment (python/node/shell) when the claim is executable (math, code behaviour, regex, data, performance, encoding), or confirm it across two or more independent authoritative sources (official docs, specs, RFCs, primary data) when it is documentable. Always attach the evidence: a source link deep-linked to the claim, or the runnable snippet plus its actual output. State confidence and method; say plainly when something cannot be grounded. Use when the user says "fact-check", "is this true", "are you sure", "verify/double-check this", "ground this", before asserting a load-bearing fact / number / API behaviour, or whenever being wrong is costly.
---

# fact-check

Never assert a load-bearing fact from memory. **Ground it, link it, or flag it as unverified.** Confidence comes from *evidence* — a reproduced experiment or agreeing authoritative sources — not from how sure the sentence sounds.

## When to reach for this

- A claim is load-bearing — a number, version, limit, API contract, algorithm result, security property, historical/legal/scientific fact — and being wrong is costly.
- The user asks to verify, "are you sure?", "fact-check this", "ground this".
- **Skip it** for trivially obvious or low-stakes claims. Grounding has a cost; match effort to stakes.

## The method — strongest evidence first

1. **Isolate the exact claim.** Restate it as a single falsifiable proposition with concrete values. A vague claim ("it's pretty fast", "large numbers") can't be grounded — sharpen it first.

2. **Pick the strongest evidence the claim allows:**
   - **Executable → run it.** If the claim can be settled by running code — arithmetic, floating-point, a regex, parsing, a data transform, an algorithm's output, library behaviour, timing/performance, encoding — write a **minimal** script (python / node / shell) and execute it. A reproducible experiment outranks any amount of reading. *Example: to check a complex math expression, write the few lines that evaluate it and run them rather than reasoning it out by hand.*
   - **Documentable → cite primary sources.** For API semantics, version numbers, limits, standards, or historical/scientific facts, consult **authoritative** sources and **confirm across ≥2 independent ones** when the claim is consequential or contested.
   - **Both when you can** — docs say X *and* a quick test confirms X is the gold standard.

3. **Climb the authority ladder** (prefer higher, distrust lower):
   - **Primary / official** — the spec or RFC, official docs, the project's own source, the standards body, the primary dataset, a peer-reviewed paper.
   - **Reputable secondary** — well-maintained references (e.g. MDN, language docs; Wikipedia *for stable facts, then follow its citation to the primary source*).
   - **Forums / blogs / Stack Overflow / LLM output** — **leads only, never proof.** Chase them down to a primary source before relying on them.

4. **Always attach the evidence.** Every grounded claim carries **either** a **source URL** (deep-linked to the relevant section, and version-pinned if behaviour is version-sensitive) **or** the **runnable snippet + its actual output**. No link and no experiment = not grounded; label it so.

## Confidence — state it, with its basis

- **Confirmed (tested)** — reproduced locally; include the snippet and its output.
- **Confirmed (sources)** — ≥2 independent authoritative sources agree; link both.
- **Likely** — a single authoritative source; link it and flag the single point of failure.
- **Unverified** — couldn't ground it; say so explicitly and do **not** assert it as fact.

## When sources conflict

Surface the disagreement rather than silently picking a side. Prefer the more authoritative and more recent source; note any version- or date-sensitivity. If the claim is executable, **break the tie with an experiment** — a reproduced result outranks a documentation dispute.

## Output

Per claim, tight: **verdict · confidence · method · link(s) or snippet+output**. The deliverable is the evidence trail, not prose — a reader should be able to re-verify from what you hand them.

## Anti-patterns

- Citing the artifact you're checking as its own proof.
- Laundering training-memory as fact ("I'm confident that…") with no source and no test.
- Treating one blog / forum / SO answer as authoritative.
- A dead or generic link that doesn't resolve to — and actually support — the specific claim.
- Over-grounding the obvious, or under-grounding something costly. Calibrate to stakes.
