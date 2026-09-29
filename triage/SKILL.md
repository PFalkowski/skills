---
name: triage
description: 'Groom tracker issues by category, state, priority and readiness for agents.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Triage

Use [READINESS.md](READINESS.md) for the canonical unattended-work bar, [AGENT-BRIEF.md](AGENT-BRIEF.md) for durable briefs, and [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) for prior feature rejections.

## Label lanes

Each ticket has one label per independent lane:

| Lane | Role | Typical labels |
|---|---|---|
| Category | Kind of work | `bug`, `enhancement` |
| State | Triage status | `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` |
| Priority | When | `priority:P1..P3`, `parked` |

These are roles, not required names. On first triage, map existing tracker labels to roles in a short local doc such as `docs/…/triage-labels.md`, linked from agent docs. Never introduce synonyms beside existing labels. Propose these roles if no convention exists. Resolve duplicate state labels.

`parked` means sound but not now/unevidenced, unlike `wontfix`; record an unpark condition in a comment, subject to the refusal gate below.

## Per ticket

1. Read body, comments, labels, dates, and prior triage. Do not reopen resolved questions. Surface matching out-of-scope records instead of re-litigating.
2. Reproduce bugs by tracing/running code. Failed reproduction supports `needs-info`.
3. Verify claims that decide the outcome; treat the ticket's framing as a hypothesis.
4. Apply [READINESS.md](READINESS.md): both ready and intended.
5. Record the outcome, respecting the gates below:

| Outcome | Record |
|---|---|
| `ready-for-agent` | [Agent brief](AGENT-BRIEF.md), scoped to ready work with exclusions |
| `ready-for-human` | Same brief plus why delegation fails: judgment, access, design, manual checks |
| `needs-info` | Established facts and specific unanswered questions |
| Done | Close only when merged work satisfies acceptance; cite merge commit |
| `wontfix` | Bug: explanation and closure. Feature: out-of-scope record, link, then closure |

Agent-readiness means finishable unattended, not important or well-written. Respect an explicit reporter statement that a decision is not an agent's call.

## Gates and unattended handoff

- **Do not enact refusals** through labels, comments, or closure unless a person asked about that specific ticket and awaits the answer. Record the reasoning in your report otherwise.
- If readiness is a human attestation, never self-apply it to your triage. When delegated by the owner, record the delegation and date alongside the judgment.
- Make intent visible before handing the board to `nights-watch` or `nightshift`. Unmarked deferrals look wanted. If no “not now” label exists and you cannot enact deferral, report that an unattended worker will take the ticket.
- Make briefs falsifiable: finding nothing must be a valid success where appropriate; see [AGENT-BRIEF.md](AGENT-BRIEF.md).
