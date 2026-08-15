---
name: handoff-lite
description: 'Extract the still-open action points from this conversation - each with the reason and risk exactly as stated - plus the last few user prompts verbatim, as one block to paste into a fresh context. Records only what was actually said; never invents a rationale, risk or task. Use for "quick handover", "carry this over", "what is left for a new agent", "context is filling up", or /handoff-lite. For the fuller note written to a file, use handoff.'
---

# handoff-lite

One block, ready to paste. What is **left to do**, why each item exists, what could bite —
then the tail of the conversation so the receiver hears the user's own words.

## The rule that makes this skill worth loading

**Only what was actually said.** Every action point, reason, risk and constraint must trace to
something in this conversation. If a task's rationale was never stated, write no rationale — do
not reconstruct a plausible one. If nothing threatens an item, give it no risk line.

A fabricated "why" is worse than a missing one: the receiver acts on it, and it is unfalsifiable
because its source does not exist. Omission is honest and cheap to repair — they ask.

Same discipline for status: an item is done only if the conversation shows it done. Verified-by-a-command
beats an agent's claim; "the tests pass" from a subagent report is a claim, not a verification.

## Emit

Scan the conversation for commitments that are still open — planned, promised, blocked, deferred,
or explicitly "next". Drop everything finished. Then output exactly this, in one fenced block:

```
## Task
<one line: what the receiver is working on>

## Open action points
1. <imperative action>
   Why: <only if stated>
   Risk: <only if stated>
   Blocked on: <only if stated>
2. ...

## Recent exchange
> <user prompt, verbatim>
– <one line: what the reply did or concluded>

> <user prompt, verbatim>
– <one line>
```

Ordering: the user's stated order wins. Absent one, hard deadlines first, then blockers, then the rest.

`Recent exchange` carries the last ~3 user prompts **verbatim** — their exact wording is the most
faithful statement of intent available, and paraphrase silently drops emphasis and constraints.
Follow each with a one-line summary of what your reply did. Skip prompts irrelevant to the open items.

## Cut

- Anything already done, and the story of how it got done.
- Narration of failed attempts — unless a dead end is itself an open constraint ("do not retry X"),
  which is an action point's `Risk`.
- File contents, diffs, command output. Reference `path:line`, a PR or an issue number.
- Anything the receiver reads off the repo: file structure, git history, what a function does.
- Pleasantries, restated goals, and your own reasoning.

## Deliver

Output the block **inline in chat**, fenced, so the user copies it in one gesture. Do not write a
file, do not clear, do not compact — the user moves it themselves.

If nothing is open, say so in one line instead of emitting an empty block.

If the remaining work cannot survive compression — the state is too entangled to state briefly —
say that plainly and recommend `handoff` (fuller note, written to a file) or staying put. A lite
handover that silently loses hard-won understanding is the one failure mode worth refusing.
