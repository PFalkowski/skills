---
name: clean-room
description: 'Reimplement behaviour you may not copy — from a codebase under an incompatible licence (AGPL/GPL/SSPL/proprietary), a competitor product, prior art owned by a former employer, or an inspected binary — as two separated passes with a screened brief as the only thing that crosses: STUDY may read the source and writes prose only, BUILD never sees it and writes all the code. Produces an auditable answer to how you know it was not copied, plus the attribution record. Use for: reimplementing without copying, Chinese wall, AGPL/GPL contamination, reading a competitor repo before building a feature, a licence or IP question attached to work about to start. Not for permissive code you can simply depend on and credit, your own code, or a borrowing too small to justify the ceremony.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# clean-room

**Two passes. One brief. Nothing else crosses.**

A clean-room implementation is not a promise that you did not copy — it is a **process that makes copying impossible and the absence of copying provable**. The proof is the artefact. If the only evidence is "I read it, then I wrote my own version, trust me", you have a clean-room *intention*, not a clean room.

## When to reach for this

Use it when **all three** hold:

1. You have (or want) access to a source you may **not** incorporate — incompatible licence, a competitor, an ex-employer's prior art, a decompiled or network-inspected binary.
2. You want the **behaviour, design, or method**, not the text. Copyright protects expression; ideas, methods and systems are free. This skill is how you stay on the free side and can show it.
3. Someone could later ask *"how do you know this wasn't copied?"* — a licence audit, an acquirer's diligence, a contributor agreement, opposing counsel, or your own future self.

**Skip it** when:

- The source is permissive (MIT/BSD/Apache-2.0) and you can just depend on it or vendor it with attribution. Reimplementing permissive code is usually waste.
- It is your own code, or code you already have rights to.
- The borrowing is one idea, one convention, one paragraph of a published methodology. Declare the tier, write the attribution line, move on. A two-pass ceremony for a one-line borrowing is theatre, and theatre devalues the real thing.

The dividing question is not size. It is: **would the answer to "how do you know?" be an artefact, or a claim?**

## Tiers — decide this before anything else

Not every borrowing needs a clean room; some are outright forbidden and no process fixes them. Classify first:

| Tier | What | Verdict |
|---|---|---|
| **A — Use it** | Permissive dependency; a public API or documented protocol consumed under its terms | Just use it. Attribute as a normal dependency. **No clean room needed.** |
| **B — Reimplement from published prose** | Architecture, algorithm design, methodology, vocabulary, observable behaviour — described in docs, papers, blog posts, or observed from the outside | **This skill.** |
| **C — Re-derive from the primary source** | A curated list, catalogue, table, dataset or coefficient set | Do not copy it, even though facts are free — curated compilations attract database rights (EU *sui generis*; and selection/arrangement can carry copyright elsewhere). Go to the upstream authority. **Frequently produces a better artefact than the intermediary's copy.** |
| **D — Needs a licence** | Any source file, snippet, asset, generated artefact, config, fixture, or the project's name/logo | **Stop.** No process makes this clean. Take the licence, negotiate terms, or drop the feature. |

If the answer is D, say so plainly and stop. A clean room applied to Tier D is laundering, and it is worse than copying openly because it also destroys the credibility of every legitimate clean room you run.

## The shape

```
  PREFLIGHT ──► STUDY pass ──► BRIEF ──► screen ──► BUILD pass ──► ATTRIBUTION
  (blind)      (contaminated)  (airlock)          (source-denied)
                     │                                   │
             may read source                    may NEVER read source
             may NOT write code                 writes all the code
```

Two roles, and the boundary between them is the whole skill:

- **Study (contaminated).** Reads the source, the docs, the running product. Writes **prose only**. May not touch the clean repository.
- **Build (source-denied).** Never opens the source, never sees a screenshot of it, never reads a study transcript. Works from the brief, the primary sources, and the clean repository.

The **brief** is the airlock. It is the only thing that crosses, and it crosses only after it has been screened.

## Procedure

### 0. Preflight — declare the goal *before* you look

Write the contract first, in the run directory (see §Run ledger), **before opening the source**:

- **Goal** — the behaviour you need, stated as what a user or caller observes.
- **Source** — what you will study, its licence, its copyright holder, its version/commit.
- **Tier** — A/B/C/D from the table above.
- **Clean root** — the repository/paths the build pass may write to.
- **Deny list** — tokens that must never appear in the brief: the source's package name, distinctive identifiers, internal path prefixes.

**The order is load-bearing.** A goal written after reading the source is a goal shaped by their implementation — you will "need" the thing they happened to build, in the shape they built it. Declaring blind is what keeps the requirement yours.

If you cannot state the goal without looking, that is the finding: you do not yet know what you want, and the honest next step is to ask the user, not to go browsing.

### 1. Study pass — read widely, write prose

Runs in its **own session**. Rules:

- **May** read the source, run it, watch it, read its docs, its tests, its issue tracker.
- **May not** write, edit or create any file under the clean root. Not a stub, not a comment, not a test name.
- **Output is exactly one file**: `brief.md` in the run directory. Nothing else leaves this pass.

The brief describes **behaviour and contracts, not construction**:

- What it does, from the outside — inputs, outputs, ordering, units, error surfaces.
- The **decisions** and their reasons — why a cap here, why a floor there, what failure mode a guard exists for. *Reasons are the highest-value thing you can carry across, and they carry no expression.*
- Edge cases and failure modes, as prose.
- Acceptance criteria, written as sentences a test could later assert.
- Open questions the build pass will hit.

It must **not** contain: source code in any language, pseudocode shaped like the source, file paths, identifier names, diffs, screenshots, UI strings, comments, or verbatim documentation sentences.

> **Test for a good brief:** could a competent engineer who has never heard of the source build the thing from it — and would their result differ from the source in every incidental choice while matching it in every behaviour you actually need? If the answer to the first is no, the brief is too thin. If the answer to the second is no, the brief is contaminated.

Note the asymmetry: **a brief that is too thin is a cost; a brief that is too rich is a defect.** When unsure, cut.

### 2. Screen the brief — mechanically, then by judgement

```bash
node <skill-dir>/screen-brief.mjs --brief <run>/brief.md --deny-list <run>/deny-list.txt
```

The screen flags code fences, path-shaped tokens, diff markers, deny-list hits, and camel/Pascal/snake identifiers that look lifted. It is a **floor, not a verdict** — it cannot detect a paraphrased implementation. After it passes, read the brief and ask:

- Does any sentence describe *how they built it* rather than *what it does*?
- Would a reader be able to reconstruct their file layout, class names, or call graph?
- Is there a passage I could not have written from the outside?

Anything that fails, cut. Then record the screen result in the ledger — an unrecorded screen is indistinguishable from no screen.

### 3. Build pass — never look

Runs in a **fresh session** (or a subagent whose context contains the brief and not the study). Rules:

- **May** read the brief, the primary sources, the clean repository, general references.
- **May not** open the source, the study transcript, or any artefact of the study other than the brief.
- Writes the code, the tests, the docs.

**When the brief is insufficient — and it will be — do not peek.** Raise a gap in the ledger and either decide it yourself from first principles (usually correct: your incidental choices *should* differ) or commission a **new study pass** to answer that specific question and amend the brief through the same screen.

The peek is the single failure mode that destroys the whole exercise, and it always feels justified in the moment because you are five minutes from done.

### 4. Refocus — audit against the declared scope

At natural checkpoints (and always before merge), compare what was built against the preflight goal:

- Did the scope drift toward the source's feature set rather than the declared goal? That is a tell that the brief carried more than behaviour.
- Are there names, structures or constants that match the source and were not derived from a primary source or an obvious convention? Change them, or record why they are unavoidable (a protocol field name, a published formula's variable).
- Is anything in the clean root traceable to the study pass rather than the brief?

### 5. Attribution and the record

Copyright rarely obliges attribution for Tier B. Attribute anyway — it is what converts a private claim into a public, checkable one:

- A **prior-art entry** in the repo (`ATTRIBUTIONS.md`, `NOTICE`, or the ADR/decision record that borrowed the idea): project, author, licence, URL, and *what specifically* was learned.
- A one-line pointer from the decision record to the run ledger.
- Never state or imply affiliation or endorsement; never use their name or marks in product surfaces.

## Run ledger

Lives **outside the clean repository** — a sibling directory, never a subdirectory, never a git submodule, never `node_modules`:

```
<runs>/clean-room/<yyyy-mm-dd>-<slug>/
  preflight.md      goal, source, licence, tier, clean root  (written blind, first)
  deny-list.txt     tokens that must not appear in the brief
  brief.md          the airlock — the only thing that crosses
  screen.txt        screen output + timestamp
  gaps.md           questions the build pass raised, and how each was answered
  attribution.md    what to paste into the clean repo's prior-art record
```

Keep it. Its whole value is being producible on demand, years later, by someone who was not there.

## Named failure modes

Learn these by name — naming is what makes them visible in the moment.

- **The peek.** Build pass opens the source "just to check one thing". Every clean room dies this way. The rule is absolute precisely because the exception is always reasonable.
- **Goal-shaped-by-source.** Preflight written after browsing. The requirement quietly becomes "what they built", and you will never notice because it feels like discovery.
- **Pseudocode laundering.** The brief contains their algorithm step-by-step in words, renamed. This is expression wearing prose as a disguise — it fails a court and it fails an engineer who reads both.
- **The identifier tell.** An unusual name, an odd constant, a distinctive spelling survives into the clean code. Nothing else needs to match for this to be the finding that sinks you.
- **Vacuous screen.** The screen "passed" because the brief was empty, the deny list was blank, or the script silently read the wrong file. A screen that examines nothing passes perfectly. Confirm it examined something: check the reported line and token counts, and once per project, deliberately plant a violation and watch it turn red.
- **Contaminated reviewer.** The build pass is clean and the reviewer says "that's not how they do it". The reviewer just became a channel. Reviewers of clean-room work are source-denied too.
- **One-session collapse.** Study and build in the same session. Even with perfect discipline, the transcript is the contamination — and the transcript is what an auditor reads.

## Modes

- **Attended** (default) — the user reviews the preflight before the study pass, and the brief before the build pass. Two gates, both cheap, both catching the two failures that matter most.
- **Unattended** — only after an approved preflight, with a bounded iteration count and a hard rule that a build-pass gap **pauses** for a new study pass rather than resolving itself by looking. Never run unattended on a first use against a new source; you do not yet know what its brief tends to leak.

## Composes with

- **`fact-check`** — for any load-bearing claim in the brief (a licence term, a published formula, an API contract). Do not carry an unverified claim across the airlock.
- **`handoff`** — the study→build boundary *is* a handoff. The brief is a handover note with an extra constraint: it must be lossless about behaviour and lossy about everything else.
- **`code-review-grill`** — the reviewer must be source-denied; brief it with the goal, not the source.
- **`evolve-skill`** — when a run finds a new leak shape, add it to the deny list defaults and to Named failure modes.

---

*Prior art: the two-role separation, the preflight-before-discovery ordering, the leakage-rules concept and the run-ledger idea are informed by the `clean-room-skill` package (pi.dev/packages/clean-room-skill). This skill is an independent, dependency-free reimplementation of that shape for plain Claude Code skills — no CLI, no hooks, no npm install — and no code from that package was used.*
