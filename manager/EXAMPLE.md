# Worked example — a worker's end-of-run PR report

The kind of output this skill exists for: an agent finishes a ticket, opens a PR, and hands back a dense, confident, low-level report. Someone has to decide what happens next. Names and numbers below are generic.

## The output

> PR #515 — `fix/resilience-pipeline-at-adapter` → `main` (ready, not draft, no human review yet).
>
> **What it does**
> - New `ResiliencePipelineProxy<TPort>` (a dispatch proxy) wraps the ORM's two repositories once, in the store. Every member — sync, `Task`, `Task<T>`, and the materialized `IEnumerable<T>` — runs inside the store's single resilience pipeline, and the store's own exception type survives. This closes F2 (paths that had lost all retry), F4 (deferred `GetAll`) and F6 (bare reconcile pair) in one place.
> - The three failover decorators, the multi-store writer and the composer lose all pipeline plumbing — they only route now. Only the ORM pipeline is registered.
> - F1: retry no longer handles `BrokenCircuitException`, minimum throughput 4 → 2, so one call's second failed attempt opens the breaker (≈45 s in prod) and later calls fail fast; the root cause is kept as the inner exception. Pinned by a test using the production defaults.
> - The pipeline is configured on the DI builder, so retry/breaker telemetry now reaches the host logger (F3, incidental).
> - ADR-075 §5/§7 carry dated amendment notes; the runbook no longer cites the deleted ladder.
>
> **Verification:** build 0 warnings; 1224/1224 tests; the composition integration test (real container) passes — and it caught a real bug in my first guard, now fixed and unit-tested. The comment-share check passes after trimming two of my files; the first CI run failed on exactly that guard, the fix is pushed as a second commit.
>
> **Still open after this PR** (from the #510 review): F5 composer/validator parity, F7 `ShouldHandle`, F8 alert on the failover counter, F9–F18 doc/comment nits.
>
> I'll report the CI result when the monitor fires.

## Step 1 — Mandate

Nothing was passed, so it comes from the ticket the PR closes and the ADR it amends: *restore retry/breaker coverage on every store path without changing the failover routing; production behaviour changes need a pinned test and an ADR note.* Defaults: `merge=allow`, `post=post`, `tickets=file`, tracker = GitHub (remote). Working assumption carried from the ticket: "the ORM store is the only layer that should own resilience."

## Step 2 — Ledger

| # | Kind | Item | Load-bearing? | Verify how |
|---|---|---|---|---|
| 1 | claim | build 0 warnings, 1224/1224 tests | yes — gates review | `gh pr checks 515` |
| 2 | claim | first CI run failed, second commit fixed it, CI now green | yes | same; latest run on the head sha |
| 3 | claim | F1 breaker change is "pinned by a test using production defaults" | yes — a prod behaviour change | fact-check subagent: does the test construct the production options, and does it fail if the threshold reverts to 4? |
| 4 | claim | ADR amended, runbook no longer cites the ladder | medium | fact-check: grep the ADR and runbook on the branch |
| 5 | decision-made | breaker opens after one call's second failure; ≈45 s fail-fast in prod | yes — user-visible in prod | judged under the rubric, after #3 |
| 6 | decision-made | decorators lose all resilience plumbing; only the ORM pipeline is registered | yes — architecture | matches the working assumption; verify by the grill |
| 7 | decision-made | "trimmed two of my files" to pass the comment-share check | low | grill covers it |
| 8 | ask (implicit) | "ready, no human review yet" = please review / merge | yes | — |
| 9 | open item | F5 composer/validator parity | — | — |
| 10 | open item | F7 `ShouldHandle` | — | — |
| 11 | open item | F8 alert on the failover counter | — | — |
| 12 | open item | F9–F18 doc/comment nits | — | — |
| 13 | promise | "I'll report CI when the monitor fires" | — | the manager watches the check itself |

## Step 3 — Verify

- `gh pr checks 515` → all checks green on the head sha; the earlier failed run is on the previous sha. Claims 1 and 2 hold.
- Fact-check subagent on claim 3 → the test builds the options through the production factory and asserts the breaker opens on the second failure; flipping the threshold to 4 makes it fail. Holds.
- Fact-check on claim 4 → ADR sections carry dated notes; the runbook section is rewritten. Holds. (Had either not held, the report's "docs updated" would have been treated as false and the PR redirected back to the worker before review.)

## Step 4–5 — Verdicts and actions

```
MANAGER VERDICT — PR #515
Mandate: restore resilience coverage on every store path, routing unchanged · merge=allow post=post tickets=file
Verified: 4 claims checked — 4 held (gh pr checks; fact-check on the F1 test and the ADR)
  A1 APPROVE   #5 breaker change (throughput 2, fail-fast) — aligned, reversible (config), pinned, ADR-noted [test + ADR §7]
  A2 APPROVE   #6 resilience owned by the ORM store only — is the working assumption; grill to confirm nothing else lost retry
  A3 REDIRECT  #8 "ready" → code-review-grill first — no independent review yet; a reviewer that never saw the rationale
  A4 DEFER     #9 F5 parity → ticket #531; #10 F7 ShouldHandle → #532; #11 F8 alert → #533 — each with the origin PR and the readiness brief
  A5 DEFER     #12 F9–F18 nits → one ticket #534, Haiku-tier, batched — not worth a PR each
  A6 APPROVE   merge, once the grill is clean and its findings worked — merge=allow; checks green, F1 change verified pinned, ADR noted
  A7 APPROVE   #13 — the manager holds the check itself; no further CI report needed from you
Next for you (in order):
  1. Stand by for grill findings; work them via fix-pr headless, reply=post resolve=fixed.
  2. Nothing else on this branch; F5/F7/F8 are filed, do not fold them in.
Report back with: the fix-pr report, or "grill clean".
```

Actions taken: `code-review-grill` dispatched on #515 with the principal brief; the merge queued behind it (the manager merges when the grill returns clean, then moves the ticket to *Done*); four tickets filed and linked from a PR comment; the verdict posted as a PR comment; the journal appended; the ticket moved to *In Review*.

## Step 6 — Report to the human

```
Managed: PR #515. Verdicts: 4 approved (incl. merge after grill), 1 redirected (grill), 2 deferred (#531–#534), 0 vetoed.
Dispatched: code-review-grill on #515 (opus); fix-pr headless and the merge queued behind it.
Escalated: none.
Budget: —. Journal: .agents/manager/journal.md
```

Nothing needs an answer. All fourteen items were decided; the human reads the merge in the journal and on the PR, not in a prompt.
