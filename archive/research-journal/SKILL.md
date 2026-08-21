---
name: research-journal
description: 'Run an academic research project as a version-controlled journal — every conversation logged verbatim with dates, every claim marked by evidence strength, every idea adjudicated against prior art before it is committed to, all in a git repo synced to a remote. Use when working toward a paper, thesis, literature survey, or any long-lived research effort: "research paper", "IEEE/ACM journal", "write a paper", "survey the field", "literature review", "prior art", "is this novel", "log this conversation", "brainstorm a paper idea", or /research-journal. Distinct from prompt-backlog (deferred work) and handoff (context transfer) — this is the durable scholarly record: field brief, idea ledger with kill-file, per-conversation prompt logs, and novelty verdicts.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# research-journal

Research fails in two specific ways that this skill exists to prevent:

1. **The lost trail.** Six weeks in, nobody remembers why an idea was dropped — so it gets re-derived,
   re-argued, and dropped again. Losing the refutation costs more than losing the idea.
2. **The unchecked negative.** A paper's contribution is almost always a claim that *nobody has done
   X*. That is a negative, it is fragile, and it is discovered at review time if not before.

Everything below follows from those two.

## Repo shape

One git repo per research project, synced to a remote from day one.

```
<project>/
  FIELD-BRIEF.md          # state of the field; refreshed, dated, evidence-marked
  IDEAS.md                # the idea ledger, including the kill-file
  conversations/
    YYYY-MM-DD-<slug>.md  # verbatim prompt log, one file per conversation
  prior-art/
    <claim-id>.md         # adjudicated novelty verdicts
  paper/                  # the manuscript itself, once drafting starts
```

Initialize on first substantive research turn — don't wait for the paper to feel real. `gh repo create
<name> --private --source . --remote origin --push`. **Private by default**: unpublished research plus
novelty claims you have not yet secured.

## Per-conversation prompt log

One file per conversation, named `YYYY-MM-DD-<slug>.md`. Write the user's prompts **verbatim, in fenced
blocks, with dates** — not paraphrased. The exact wording is the primary record: it carries the framing
and the intent that a summary silently discards, and ideas are frequently recovered from a phrase the
summariser thought was noise.

Under each prompt, a short **Outcome**: what it produced, what it killed, where the artifact landed.
Close every log with **Open threads** — what a cold reader must pick up. Template: [TEMPLATE.md](TEMPLATE.md).

Write the log *during* the session while context is live, not at the end from memory.

## Evidence marking — the discipline that matters most

Every factual claim in the field brief carries its provenance:

- **[read]** — primary source fetched and read in full.
- **[snippet]** — from a search result only. **Must be re-verified against the PDF before it enters a
  related-work table or any comparison.**

Search snippets routinely garble numbers, attribute results to the wrong paper, and hallucinate
plausible arXiv IDs. A number that reaches a submission unverified is a retraction risk. Never launder
a `[snippet]` into a `[read]` without actually fetching the source.

Never invent a citation. An empty result is a finding; a fabricated identifier is misconduct.

## The idea ledger

`IDEAS.md` holds every idea with a status: **[CANDIDATE]** (viable, novelty unchecked), **[PARKED]**
(interesting, blocked — say by what), **[DEAD]** (refuted).

**Keep the dead ones, with the refutation written out.** This is the kill-file, and it is the highest
-value part of the ledger: it stops the project re-walking ground it already cleared. Record *why* it
died, and — critically — **what survives**: the fragment of a dead idea that remains usable, since
refuted ideas usually contain a correct instinct pointed the wrong way.

Each candidate carries: working title, target venue, origin (the question that produced it), the
mechanism, why it should survive review, the feasibility probe that would confirm it cheaply, and its
**open risk**.

## Adjudicate novelty before investing

Before committing to any contribution, run an **adversarial** prior-art check: agents instructed to
*refute* the claim, not to confirm it. Finding a refutation is a success — the cost of learning at
review time is months.

Cover the adjacent communities' vocabulary, not just your own. Most near-misses live in a neighbouring
field under different terminology — the same idea under another name, or a technique that one community
treats as novel and another solved years ago. Seed the search with the near-misses you already suspect,
so they get characterized precisely rather than discovered late.

**Treat a delegated verdict as a lead list, not as a finding.** Reviewers are reliable at *surfacing*
candidate prior art and unreliable at *characterizing* it — they will report experiments a paper does
not contain and mechanisms it does not use, stated with full confidence. Before conceding a
contribution to prior art, read the source yourself. A wrongly conceded claim kills a real paper just
as dead as an unfound refutation, and it does it silently.

Record the verdict in `prior-art/<claim-id>.md`: NOVEL / PARTIALLY_ANTICIPATED / ANTICIPATED, the
closest work, **what survives**, and the must-cite list. A PARTIALLY_ANTICIPATED verdict usually
*improves* a paper — it hands you the precise related-work anchor and forces a sharper claim.

## Delegate the mechanical work

Literature sweeps, prior-art hunts, bulk verification of `[snippet]` figures, and citation chasing are
breadth work: well-specified, wide, judgment-light. Hand them to a **dynamic Workflow with Sonnet
agents** and schema-validated returns, run in the background. Keep the main context for framing,
adjudication, and authoring.

Do **not** delegate the authorial core — the framing of a contribution, the decision of what to claim,
the writing. Those are the work.

## Sync

Commit at the end of every session with a message naming what moved (`brief: refresh baseline numbers`,
`ideas: park approach A, promote approach B`). Push. An unsynced research repo is a single disk failure
away from being the lost trail this skill exists to prevent.

One caution specific to research: the repo holds unpublished contributions. Keep it **private** until
the work is public. Naming an unpublished idea in a public commit timestamps and discloses it.
