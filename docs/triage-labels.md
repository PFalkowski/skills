# Triage label vocabulary

How this repo's GitHub labels map onto the triage lanes used by the `triage` and `nights-watch` skills.
Labels are **independent lanes** — a triaged issue carries one from each lane, and the lanes answer
different questions. The readiness bar itself is defined once, in the `triage` skill's `READINESS.md`
(ready **and** intended, both must be yes); this doc only records the local names.

## Category — what kind of work is this?

| Label | Meaning |
|---|---|
| `bug` | Something isn't working (GitHub default) |
| `enhancement` | New feature or request (GitHub default) |
| `documentation` | Doc-only work (GitHub default) |

## State — where is it in triage?

| Label | Meaning |
|---|---|
| `needs-triage` | Not yet triaged |
| `needs-info` | Triage blocked on specific open questions — the triage comment lists them; never a bare "please provide more info" |
| `ready-for-agent` | An unattended agent can take this. An agent brief is on the issue |
| `ready-for-human` | Triaged and sound, but needs a person: judgement call, external access, design decision, or manual verification — the triage comment says which |
| `wontfix` | Declined, with the reason on the issue (GitHub default) |

## Priority — when, if ever?

| Label | Meaning |
|---|---|
| `priority:P1` | Next |
| `priority:P2` | Soon |
| `priority:P3` | Eventually |
| `parked` | Sound but not now. Must carry its unpark condition in a comment, or it is indistinguishable from neglect |

`parked` is a deliberate intent signal: once agents read the board, unmarked deferred work looks exactly
like wanted work. Withholding work from agents is done here, in the priority lane — not by withholding
`ready-for-agent`.

## Provenance

Vocabulary established 2026-08-18 during the first agent triage of this repo, at the owner's request.
`ready-for-agent` applied by an agent is triage output, not a human attestation; the applying triage
comment says so and names the date. The owner can override any lane by relabeling — a triage label is
a judgement, not a lock.
