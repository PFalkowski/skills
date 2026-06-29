---
name: neat
description: "The rigorous, by-the-book SDLC process. Pick up whenever BAU and quality is important like in the old days! Do not use for quick fixes, throwaway scripts, spikes, or 'just ship it' — that's go-go-go skill."
---

# neat — the deliberate, full-lifecycle SDLC

*"Served neat: no shortcuts, no dilution."* The patient, quality-first counterpart to **go-go-go**. You are the **conductor**: each phase is delegated to the focused skill that owns it; you sequence them, hold the gates, and keep the paper trail. Never skip a phase to save time — skipping is what go-go-go is for.

## Step 0 — Right-size first (don't over-process)

Confirm the work deserves this weight. A typo, a one-liner, a throwaway spike → **stop, say "this is a go-go-go job, not a neat one", and exit.** neat is for changes where getting it wrong is costly: new features, subsystems, public APIs, data/schema, money, security, anything hard to reverse.

## The lifecycle — each phase has a GATE; do not advance until it's met

| # | Phase | Delegate to | Gate / artifact |
|---|---|---|---|
| 1 | **Specify** | `to-prd` (or a written spec doc) | A written spec/PRD: problem, goal, scope, **non-goals**, success criteria. |
| 2 | **Grill requirements** | `grill-with-docs` (fallback `grill-me`) | Every load-bearing ambiguity resolved; acceptance criteria written; domain language + ADRs / `CONTEXT.md` updated as decisions crystallise. |
| 3 | **Slice** | `to-issues` | Spec broken into tracer-bullet **vertical slices** on the tracker, each independently shippable. |
| 4 | **Test-first (RED)** | `tdd` | Per slice: a **failing** test that encodes its acceptance criterion — written *before* any implementation. |
| 5 | **Implement → GREEN → refactor** | `tdd` | Minimal code to pass (GREEN), then refactor with tests green. Loop 4–5 per slice. |
| 6 | **Adversarial review** | `code-review-grill` | Fresh-agent grill of the diff. Auto-apply mechanical fixes; non-mechanical findings → **unresolved PR comments**; new work → issues. |
| 7 | **Refactor / deepen** | `improve-codebase-architecture` | Design debt the review surfaced is addressed — or consciously deferred as an issue. If it reopens behaviour, loop back to 4. |
| 8 | **Merge** | `merge-stack` | Green CI + review resolved, then land — **only on explicit human go** for protected/default branches. |

## Discipline

- **Gates are real.** No code before the spec is grilled and a test is red. No review before it's green. No merge before it's reviewed.
- **Every phase leaves an artifact** — spec, ADR, issue, test, PR comment, commit. The auditable trail *is* the deliverable, not a side effect.
- **Conduct, don't solo.** Use the owning skill for each phase; this skill only sequences and holds the gates. If a phase's skill isn't installed, do that phase by hand to the same standard and say so.
- **Iterate, don't waterfall blindly.** The arrows go forward, but a review or refactor that reopens a requirement sends you back a phase — that's the process working, not failing.
- **Stop-and-confirm** keeps the usual bar: irreversible or outward-facing actions (merge to a shared branch, publishing, schema/data migration, spend) need an explicit human go. Everything reversible: decide and proceed.

## Choosing between this and go-go-go

| | **neat** | **go-go-go** |
|---|---|---|
| Optimises for | correctness, design, paper trail | speed to a raised PR |
| Starts from | a problem to specify | whatever state the repo is in |
| Requirements | grilled until sharp | inferred; ask only on hard ambiguity |
| Best for | features, subsystems, high-stakes change | fixes, chores, spikes, "just ship it" |

When in doubt about which to use, ask the user one question: *"proper full lifecycle, or just ship it?"*
