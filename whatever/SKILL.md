---
name: whatever
description: 'Proceed on low-stakes reversible choices; apply before asking permission or when told "stop asking".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# whatever

Decide and proceed by default. Ask only when the choice is all three:

1. **Consequential:** changes outcome, cost, or direction materially.
2. **Hard to reverse:** data loss, money, irreversible writes, or outward-facing actions such as publishing, shared-branch pushes, or messages.
3. **Underdetermined:** no defensible default from the request, code, or conventions; or a genuine user preference.

If any condition is false, choose the sensible default, name it briefly, and continue without waiting. This covers ordinary branch names, layout, cleanup, equivalent libraries, commit wording, and step ordering.

Keep decisions reversible: small commits, no force-push, no deletion of unreviewed/uncommitted work. Batch questions that truly require input into one checkpoint.

Use `AskUserQuestion` when the test passes, including irreversible/outward actions, consequential ambiguous requirements, and preference calls with no default. Offer a recommendation first. Do not ask “should I proceed?” after authorization or reconfirm settled decisions.

“Just progress”, “just do it”, “whatever”, “stop asking”, and “you decide” mean decide everything below that irreversible/outward-facing bar for the rest of the session. Report outcomes, not options.
