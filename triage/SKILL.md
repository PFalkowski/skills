---
name: triage
description: 'Grooms an issue tracker into category/state/priority lanes using one bar: specified well enough and wanted now. Writes briefs or notes, and reports refusals instead of enacting them. Use when triaging or grooming a backlog, deciding whether a ticket is agent-ready, preparing work for an unattended run, or /triage.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Triage

Move tickets through a small state machine so the board says what it means — and so an autonomous agent can be
pointed at it without a person vetting every item.

## Reference docs

- [READINESS.md](READINESS.md) — **the bar**: is this work an unattended agent should take? Canonical; other
  skills reference it rather than restating it.
- [AGENT-BRIEF.md](AGENT-BRIEF.md) — how to write a brief that stays useful weeks later.
- [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) — the rejected-feature knowledge base.

## Lanes, not a list

Labels are **independent lanes**. A ticket carries one from each, and treating them as a single list is the
usual reason a board stops meaning anything.

| Lane | Question it answers | Typical labels |
|---|---|---|
| **Category** | What kind of work is this? | `bug`, `enhancement` |
| **State** | Where is it in triage? | `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` |
| **Priority** | When, if ever? | `priority:P1..P3`, plus a `parked` for "sound, but not now" |

These are canonical **roles**, not label strings. Real trackers use their own names.

**On the first triage of a repo, find the local names and write them down** — a short doc (`docs/…/triage-labels.md`
or equivalent) mapping each role to the label this tracker actually uses, linked from the repo's agent-facing
readme. Never mint a new name beside an existing one: it splits the vocabulary and strands real work under the
older label. If a repo has no convention, propose the roles above.

`parked` earns its place in the priority lane because `wontfix` is a different claim. Parked means sound but
unevidenced, and it must carry its unpark condition in a comment or it is indistinguishable from neglect.

## Triaging one ticket

1. **Read everything** — body, comments, labels, dates, prior triage notes. Do not re-ask a resolved question.
   Check the out-of-scope records for a matching prior rejection and surface it instead of re-litigating.
2. **Reproduce, for bugs.** Trace the code, run the command. A confirmed reproduction makes a far stronger brief;
   a failed one is strong evidence for `needs-info`.
3. **Verify the load-bearing claims** rather than inheriting them. A ticket's own framing is a hypothesis. Where
   a claim decides the outcome, prove it — and expect some to collapse, which is the process working.
4. **Apply the bar** in [READINESS.md](READINESS.md): ready *and* intended.
5. **Record the outcome:**

| Outcome | What to write |
|---|---|
| `ready-for-agent` | An agent brief ([AGENT-BRIEF.md](AGENT-BRIEF.md)). Scope it to the part that is genuinely ready and say what you excluded. |
| `ready-for-human` | The same structure, plus *why it cannot be delegated* — judgement call, external access, design decision, manual verification. |
| `needs-info` | Triage notes: what is established, and the specific questions outstanding. Not "please provide more info". |
| `wontfix` | A bug: explain and close. A feature: write the out-of-scope record first, link it, then close. |

## The bar is about autonomy, not quality

`ready-for-agent` does not mean "important" or "well written". It means an unattended worker can finish it
without a person in the loop. Plenty of excellent, urgent tickets are `ready-for-human` — that is not a demotion.

Respect a reporter who writes "this is not an agent's call" in the body. They are answering the question the
labels cannot.

## Handing the board to an agent

A groomed board is the input to an unattended run (`nights-watch`, `nightshift`). Two things make that safe, and
both are triage's job, not the runner's:

- **Intent must be visible on the ticket.** A judge reading the board infers "not now" from labels and prose. If
  deferred work is not marked, it looks exactly like wanted work. This is the practical reason `parked` matters
  more once agents read the board than it did when only people did.
- **Briefs must be falsifiable.** See [AGENT-BRIEF.md](AGENT-BRIEF.md) — a brief that cannot succeed by finding
  nothing will produce a finding whether or not one exists.

## Never enact a refusal

Declining a ticket is a judgement, and judgements applied across a board are sometimes wrong. Record the reason;
do not label, close, or comment a ticket into a state on that basis — unless a person asked about that specific
ticket and is waiting on the answer.

A reported refusal costs a line of text when it is wrong. A written one costs somebody the work of finding an
authoritative-looking label and undoing it.

## Who may declare a ticket agent-ready

Where a repo treats agent-readiness as a human attestation, an agent must not self-apply it to its own triage
output — that is self-certification. If the owner delegates it, record the delegation and its date alongside the
judgement, so the provenance survives in the thread.
