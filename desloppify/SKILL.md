---
name: desloppify
description: 'Remove stale prose, duplication, dead code and excess abstraction without changing behavior.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# desloppify

Reduce cognitive load without changing behavior; see [less-is-more](../less-is-more/SKILL.md).

## Invocation

```text
desloppify [scope=<path/glob>] [mode=assess|campaign|item]
           [focus=all|docs|comments|code|architecture|tests]
           [budget=small|standard|deep] [architecture=auto|repo|ddd|clean]
           [apply=report|approved] [tracker=auto|github|azure-devops|jira|none]
           [max_items=<n>]
```

Defaults: whole repository, `mode=assess`, `focus=all`, `budget=standard`, `architecture=auto`, `apply=report`, `tracker=auto`, no item cap (budget bounds the run). Every argument must bind to a step in [RUNBOOK.md](RUNBOOK.md), step 1.

## Constraints

- Preserve user changes and generated/vendor boundaries. Isolate broad campaigns in a branch or worktree before editing.
- Establish document truth before judging code: classify drift, bloat, gaps, contradictions, and orphans; identify each claim's source of truth.
- Apply [no-comment](../no-comment/SKILL.md) and [less-is-more](../less-is-more/SKILL.md) together. Propose removal of superseded code, tests, config, or abstractions in the same bounded change. Never add architectural layers merely for appearance.
- Keep one canonical statement per load-bearing fact. Correct every restatement of a disproven fact.
- Do not replace deletion with summaries, indexes, knowledge graphs, or archives. Keep campaign notes untracked; durable truth belongs in code, tests, git history, one ADR, or necessary user docs.
- Use [fact-check](../fact-check/SKILL.md): minimal runs for executable claims, exact locations for code claims, authoritative sources for external claims. Refute findings and group them by root cause.
- **Require approval of each named item** before deletion, behavior/public-contract/architecture changes, ticket creation, or external writes. Scope approval does not approve deletions. Audit external systems read-only.

## Workflow and output

Read [RUNBOOK.md](RUNBOOK.md): inventory and record uncovered areas; baseline build/test/lint; audit docs; scan context hotspots; refute/deduplicate; route root causes to `now`, `ticket`, or `drop`; apply approved slices and re-run checks.

Use [housekeeping](../housekeeping/SKILL.md) for broad docs-first audits, suggest the human run manual-only `/context-reduction` for prose/comment deletion campaigns, [code-review-grill](../code-review-grill/SKILL.md) for material cleanup diffs, and [triage](../triage/SKILL.md) for agent-ready backlog work.

Report `uncovered` first, then baseline, truth decisions, root-cause findings with evidence and cognitive cost, approved/applied changes, deferred work, and validation. Zero findings is valid only after the requested scope and checks ran.
