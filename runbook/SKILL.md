---
name: runbook
description: 'Turns "guide me through X" into a committed runbook at docs/runbooks/<slug>.md and walks the user through it, each step marked You (only the user can do it) or Assistant (done once the user reports back). Triggers: "guide me through", "walk me through", "how do I do X step by step", "write a runbook", any procedure touching accounts, consoles, payments or hardware.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# runbook

A walk-through typed into chat evaporates: the user follows it with a browser or a console
open, not the conversation, and comes back later with results. Half the steps are theirs
(accounts, credit cards, SSH keys, physical hardware) and half are the assistant's once they
report back. The durable artifact is a file in the project; the chat only points at it.

## Triggers

"guide me through", "walk me through", "how do I do X step by step", "write a runbook", or
any request to be led through a procedure that reaches outside the assistant's tools.

## Runbook

1. **Scope it.** One line on what following the procedure achieves and what it does not.
   List prerequisites, each with the cheapest command that checks it.
2. **Verify the outside world.** Look up every price, console flow, flag and URL you are
   about to write down; record the date and the sources. Nothing older than the repository
   goes in from memory.
3. **Make the enabling changes first.** If the procedure needs code — a host variable, a
   flag, a script option — make it, test it, commit it, and reference the commit. Never hand
   over a runbook that assumes code that does not exist yet.
4. **Write `docs/runbooks/<slug>.md`** from the template below: kebab-case slug, create the
   directory, every step marked **You** or **Assistant**, every **You** step naming exactly
   what to report back, commands copy-pasteable with the shell named, `<placeholders>` for
   values the user supplies.
5. **Commit the runbook** before the first word of walk-through.
6. **Walk through in chat, briefly:** point at the file, state the next **You** step and what
   to report back. Do not repeat the file.
7. **On report-back,** run the **Assistant** steps that are now unblocked, then hand back the
   next **You** step.
8. **Fold every correction into the file the moment it is learned** — a gated credit, a
   renamed flag, a changed price — and commit again. The file is the source of truth; the
   chat is not.
9. **Close with the meter.** Confirm the stop-the-meter step was done and append the outcome
   (date, result, cost, corrections) to the runbook's Outcomes section.

## Template

```md
# Runbook: <procedure>

**Purpose.** <what following this achieves; what it does not>
Written <date>; sources: <links>.

## Prerequisites
- <thing> — check: `<command>`

## 1. <step> — **You**; report back <exactly what>
<commands; name the shell; <placeholders> for values the user supplies>

## 2. <step> — **Assistant**, once <condition>
<commands the assistant runs>

## N. Stop the meter — **You**
<the action that actually stops cost or exposure: destroy not power off, revoke, close>

## What this measures and what it does not

## Outcomes
- <date>: <result, cost, corrections made>
```

## Rules

- One file per procedure; running it again later starts from the file, not from memory.
- Prices, flows and flags drift faster than repositories: date them, source them, and expect
  step 1 to be wrong by the evening. That is why step 8 exists.
- Keep the chat short. If the walk-through is longer than the file, the file is incomplete.
