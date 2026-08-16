# FILING — turning a finding into a ticket someone can pick up

Used by step 4 (documentation gaps) and step 5 (sweep work items). One rule above all others:

> **No script in this skill files anything.** Posting is outward-facing — other people read the
> board, get notified, and act on it. The conductor asks, the user approves the exact text, and only
> then does it go up.

## Before writing a single ticket: search the board

A duplicate is worse than a missing ticket. It splits the discussion, and it teaches people that the
board is noise.

```bash
gh issue list --search "<key terms>" --state all --limit 30           # GitHub
az boards query --wiql "SELECT [System.Id],[System.Title] FROM workitems WHERE [System.Title] CONTAINS '<term>'"   # Azure DevOps
```

For Jira, use whatever MCP tool or CLI the repo already uses — and if none is configured, **ask**
rather than filing into the wrong project. If a matching ticket exists: add the new evidence as a
comment (with the user's approval) and report it as *found*, not *filed*.

Check the out-of-scope records too, if the repo keeps them (`triage`'s `OUT-OF-SCOPE.md`). An idea
rejected last quarter should not be re-litigated by a sweep that never heard about it.

## What earns a ticket

| File it | Don't |
|---|---|
| The code is wrong and the fix is more than an edit | Anything already fixed in this run |
| A document is missing and someone needs it | A `drop` item — say it out loud instead of filing it to be ignored |
| A verified defect the sweep found | An unverified candidate; refuted findings do not become tickets |
| An `L`/`XL` work item | Three symptoms of one cause — that is *one* ticket |

**One ticket per piece of work.** If two items would be picked up by one person in one sitting, they
are one ticket. If a ticket needs two people or two reviews, it is two.

## The body

Write for a stranger reading it in three months, with none of this context:

- **What is wrong**, in one sentence, as a claim that can be falsified.
- **Evidence**: `path:line`, the command and its real output, or the quoted authoritative source.
  This is what separates a ticket from an opinion, and it is what stops it being closed as stale.
- **Why it matters**: the cost. A defect it permits, an hour it adds, a rule it breaks. Never
  "cleanliness".
- **Suggested fix**, as a sketch. Say if it is one of several approaches.
- **Size and risk**, honestly — `S/M/L/XL` and what could break.
- **Provenance**: "found by a housekeeping run on `<date>`, from `<the doc or lens>`". Whoever picks
  it up should know it was machine-found and human-approved, not reported by a user hitting it.

## If an agent may pick it up

Apply the bar in the `triage` skill's `READINESS.md`: *specified well enough* **and** *actually
wanted now*. The second is the one that gets skipped, and it is why perfectly-specified parked work
gets built by an unattended agent nobody asked.

Write the agent brief into the ticket, and label per the repo's own vocabulary — never mint a new
label beside an existing one. Where agent-readiness is a human attestation in that repo, do not
self-apply it to your own output.

## Approval, exactly

Show the user, per ticket: **tracker + project, title, labels, and the full body**. Then file. Report
back the links, and the ones the user cut — a rejected ticket is a decision worth recording so the
next housekeeping run does not raise it again.

Never transition, close or comment on someone else's existing ticket as a side effect. And never
write to Confluence, a wiki, or any authoritative external — those are read-only in this skill, in
every step, without exception.
