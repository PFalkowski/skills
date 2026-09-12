---
name: context-reduction
description: 'Shrinks a repo''s prose — comments, docs, agent artifacts — by deleting it after moving the truth into code, tests, and git history, never by layering summaries, indexes, or knowledge graphs on top. Triggers: "context reduction", "prune the docs", "too many comments", "the wiki is stale", or a proposed knowledge base / graph DB / doc-summary layer (this skill is the counter-proposal). Distinct from no-comment (one comment at a time) and housekeeping (audit without deletion).'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# context-reduction

The only reduction that is real is **deletion** — making code, tests, and git history the
record, then removing the prose.

**The anti-pattern this skill refuses:** adding a derived layer — knowledge graph, doc
index, summary-of-docs, "archive" folder. Every derived layer is a second copy of the
truth with no mechanism keeping it honest; it gets read as authoritative precisely when
it is most wrong. An archived doc is still in the search path; a graph node still
answers queries after the code moved on.

One index is not a derived layer: a **pointer table**, one line per record — name, status,
where it is — written in the same edit as the record it lists. That is routing, and a log
too big to read whole needs it. It turns into the anti-pattern the moment a row starts
carrying the record's content, because then it is a summary with a second copy's decay and
it is read by everyone who orients. A row that has grown into a paragraph is a deletion
target, not a documentation win.

**Where truth is allowed to live** (everything else points here or dies):

| Truth | Owner |
|---|---|
| What the code does | the code |
| That it keeps doing it | a test (ordinary > architecture > characterization pin) |
| What it used to do, and why it changed | git history — never inlined changelog |
| A value | its config file, one place |
| A decision | one ADR; link it, never summarise it |
| A campaign's own working notes | untracked scratch; only the ledger row and the PR survive |

## The runbook

Stages gate each other: **deletion is irreversible and its damage is invisible** — a
behaviour whose only record was prose has no test, so no build goes red when the record
dies. Safety work comes first, and ends in a mechanically checkable state.

### Stage 0 — Measure and write the bar down

1. Build (or reuse) an **executable counter** — e.g. a comment-share script (comment
   lines / code lines, per file and total) — and record the baseline. *Validate the scope
   filter against a known file list — a test project silently counted as production
   invalidates the number.*
2. Write the survival bar into the repo's agent-instructions file (CLAUDE.md or
   equivalent) as the project's allowlist extension: a comment/doc survives only if
   removing it could cause a wrong, costly decision the code cannot prevent —
   **(1) traps** (the obvious approach fails non-obviously), **(2) external constraints
   invisible in code, with the source cited**, **(3) non-obvious why, 1–2 sentences**,
   **(4) destructive-operation safety warnings**. Plus one structural rule: *a comment
   may not assert the behaviour of code it does not sit on — if the claim matters,
   write a test.*

### Stage 1 — Drift scan (additive, agent-safe)

3. Fan out scanners over disjoint scopes (ADRs, current-guidance docs, agent-facing
   docs, code comments per project, external skills/config). Scanner contract, verbatim
   into every prompt: **read the actual file/code before opening a finding** — a
   finding nobody verified is future drift. Cap findings per scanner and prefer claims
   an agent would *act* on (commands, paths, config values) over trivia.
4. Bucket every claim: **drifted** (false — fix at source or delete), **duplicated**
   (name the ONE owner; every copy becomes a pointer or dies), **sole record** (true,
   not derivable from code, recorded nowhere else), or keep-worthy under the bar.
5. **History is not drift.** ADRs and dated records are immutable; a superseded ADR
   gets a one-line `Superseded by …` marker, never a rewrite. *Why: rewriting history
   destroys the decision trail that is the one thing prose legitimately owns.*
6. Assign stable IDs with states (`open`/`accepted`/`wontfix`/`fixed`). The working
   report is untracked scratch; the durable record is a one-row ledger entry (INDEX)
   carrying the open IDs, plus the PR description.

### Stage 2 — Sole-record blind spots (the load-bearing stage)

7. For each sole record, ask: **does any test ASSERT this claim?** Judge by reading the
   candidate test's assertion, not by coverage numbers — *a line can be executed by a
   test that asserts nothing about the claim, and coverage tooling has its own traps.*
   Record per ID: behaviour, code location, test found (exact test name) or NONE,
   testable-without-credentials.
8. Verify, don't assume in either direction — many sole records turn out already pinned.

### Stage 3 — Dispositions

9. Every sole record gets exactly one recorded disposition: `already-tested` /
   `ordinary-test` (prefer — a clear contract) / `architecture-test` (structural
   claims) / `characterization-pin` (golden master, for "what it does today is the
   spec") / `neither`, **with the reason written down**. *Why record the noes: an
   undocumented no is re-litigated by every future run.*
10. **The gate is mechanical**: a one-liner that fails on any blank disposition cell.
    *Why: "the list looks done" is exactly the judgment an eager agent gets wrong;
    a script cannot be optimistic.*

### Stage 4 — Delete (human-gated, delete-first)

11. **Explicit human go, recorded** (issue comment or equivalent) — never started on
    the agent's own reading of the gate, even when the gate passes.
12. Sweep **delete-first**: removal is the default; compression to 1–2 lines is the
    exception, reserved for unambiguous allowlist content. *Why (owner correction,
    verbatim, after reviewing the first pass): "the comments were just shortened
    instead of being mostly removed — I prefer removing most of them." A trimmed
    restatement still drifts and still costs context; do not keep it because effort
    went into writing it.*
13. Sweep mechanics: comment-only / prose-only edits, zero code-line changes; XML/doc
    blocks live or die whole; a pinned trap becomes a one-line pointer to its pinning
    test; protected keeps (the dispositions ledger's `keep` rows) are named explicitly
    in every sweep prompt. Verify each slice: build clean, tests green, counter
    re-run. Land in reviewable slices, worst-file-first.
14. **Delete, don't archive** — and fix drift at its source, never by adding a
    correcting note next to it.
15. Session artifacts nothing reads back (run logs, handoffs, scratch briefs, field
    notes) skip Stages 2–3: they record process, not behaviour. Delete them first —
    it's the cheapest win and proves the pipeline.

### Stage 5 — Keep it down

16. Wire the Stage-0 counter into CI with hard thresholds. *Why CI and not review
    checklist: re-accumulation is silent and gradual; only a gate that fails a PR is
    heard.*
17. Register the drift scan as a recurring process with an interval; feed lessons
    back into the skills that misbehaved (a stale skill is drift with an execution
    engine attached).
18. Keep the campaign's own artifacts to the same standard: ledger rows and PR
    descriptions survive; per-run reports are gitignored scratch. A reduction
    campaign that leaves a pile of tracked reports has added a derived layer.
