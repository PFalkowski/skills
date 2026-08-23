---
name: desloppify
description: "Reduce a codebase's cognitive and context load by removing stale prose, duplication, dead paths, and unnecessary abstractions while preserving behavior and following the repository's own architecture. Use when an autonomous-agent-grown codebase feels bloated, confusing, inconsistent, over-commented, or costly to load; supports scoped audits, cleanup campaigns, and backlog runs with focus, budget, architecture, and apply arguments."
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# desloppify

Make the repository easier to understand for the next human or agent. Optimize for
the behaviour a reader must hold in context, not for a smaller diff or a lower line
count. A named extraction can be a reduction; a clever one-liner can be an increase.

## Invocation

```text
desloppify [scope=<path/glob>] [mode=assess|campaign|item]
           [focus=all|docs|comments|code|architecture|tests]
           [budget=small|standard|deep] [architecture=auto|repo|ddd|clean]
           [apply=report|approved] [tracker=auto|github|azure-devops|jira|none]
           [max_items=<n>]
```

Examples: `desloppify mode=assess focus=comments budget=small max_items=5` or
`desloppify scope=src/orders mode=item focus=code architecture=repo`.

Defaults are the whole repository, `mode=assess`, `focus=all`, `budget=standard`,
`architecture=auto`, `apply=report`, and no outward tracker mutation. Treat `ddd` or
`clean` as a review lens only when the repository or the user calls for it; never add
layers, entities, ports, or value objects merely to make the code look architectural.

## Non-negotiables

- Preserve user changes and generated/vendor boundaries. A broad campaign uses an isolated
  branch or worktree before editing.
- Establish document truth before judging code against it. Classify drift, bloat, gaps,
  contradictions, and orphans; name the source of truth per claim.
- Reduce code and comments together. Apply [no-comment](../no-comment/SKILL.md) to every
  comment, and [less-is-more](../less-is-more/SKILL.md) to every code change. Delete a
  superseded path, test, config entry, or abstraction in the same bounded change.
- Never create a summary, index, knowledge graph, or archive as a substitute for deletion.
  Keep campaign notes untracked; durable truth belongs in code, tests, git history, one ADR,
  or a genuinely necessary user-facing document.
- Verify every load-bearing finding with [fact-check](../fact-check/SKILL.md): executable
  claims by a minimal run, codebase claims by exact locations, and external claims by
  authoritative sources. Refute before reporting; group symptoms by root cause.
- Do not delete, change behavior or public contracts, alter architecture, file tickets, or
  write to external systems until the user approves the exact proposed scope. External systems
  are read-only while auditing.

## Workflow

Read [RUNBOOK.md](RUNBOOK.md) for the full run. In brief: inventory cheaply and record
uncovered areas; baseline build/test/lint; audit docs; scan prioritized context hotspots;
refute and deduplicate findings; route each root cause to `now`, `ticket`, or `drop`; then
apply only approved slices and re-run the guardrails. Use [housekeeping](../housekeeping/SKILL.md)
for broad docs-first auditing, [context-reduction](../context-reduction/SKILL.md) for a
comment/prose deletion campaign, [code-review-grill](../code-review-grill/SKILL.md) for a
material cleanup diff, and [triage](../triage/SKILL.md) when creating agent-ready backlog work.

## Output

Lead with `uncovered`, then baseline, source-of-truth decisions, findings grouped by cause
with evidence and cognitive-load cost, approved/applied changes, deferred backlog items,
and validation results. A zero-finding result is valid only when the requested scope and
checks actually ran.
