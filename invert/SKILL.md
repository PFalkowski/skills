---
name: invert
description: 'Stress-test a plan or hard-to-reverse change by identifying and preventing failure conditions.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# invert

Name what would guarantee failure, then prevent it.

1. Write specific, falsifiable outcomes in the form “it shipped and then X.” Usually three suffice: “the per-row query runs 40,000 times during import” is useful; “it might be slow” is not.
2. Check whether the plan already causes any of them.
3. Block each failure or explain why it cannot happen. If it cannot be blocked, expose it as an assumption in the PR, report, or handover.

Stop when every failure you can name is blocked. Act on the findings; a risk list alone is insufficient. Use inversion to enable the work, not refuse it, and still provide the forward path.

Apply to plans/specs/designs, stalled approaches, self-review, handoffs, or changes that are hard to reverse or costly to get wrong.

Related applications: [reflect](../reflect/SKILL.md) pre-mortems; [code-review-grill](../code-review-grill/SKILL.md) diffs; [sdlc-old-fashioned](../sdlc-old-fashioned/SKILL.md) Phase 5 plans; [nights-watch](../nights-watch/HUNT.md) refuters. [fact-check](../fact-check/SKILL.md) grounds the claim inversion identifies.
