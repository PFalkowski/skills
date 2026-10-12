---
name: housekeeping
description: 'Audit docs against code and read-only externals, then scan code drift; human approval gates deletions.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Housekeeping

Audit documentation against reality before judging code against it.

## Reference docs

Read [DOC-TRIAGE.md](DOC-TRIAGE.md) before adjudication, [FILING.md](FILING.md) before ticket preparation, and [SWEEP.md](SWEEP.md) before the code-hygiene sweep.

## Step 0 — Right-size, then isolate

Use for a repository pass; fix a single stale paragraph directly. Report:

- Dedicated worktree + branch (`EnterWorktree`).
- Authoritative external sources and access (MCP/CLI/URL). Externals are always read-only.
- Issue tracker and conventions; ask if the repo does not establish them.

## Step 1 — Audit the documentation (read-only)

```
Workflow({ name: 'housekeeping-audit', args: {
  startedAt: '<MM-DD HH:mm — the script has no clock>',
  paths: null,                 // inventory docs automatically
  includeComments: true,
  externals: [{ name: '<source>', how: '<MCP tool / CLI / URL>' }],
  maxShards: 6, perShard: 8, reserve: 40000,
  chronicleDir: '~/.agent-state/<repo-slug>/housekeeping/chronicles',
} })
```

Shard by code area so contradictory docs reach the same auditor; refute-verify every finding. Read `uncovered` first: failed auditors leave unexamined surface.

Plugin installs prefix workflow names with `pfalkowski-skills:`; `link-skills.ps1` development installs use bare names. A `not found` error lists available names.

## Step 2 — Adjudicate the source of truth — ALWAYS ASK

Never silently default this gate. Group findings by disposition, worst first and `bloat` last. Show document claim, reality, proposed authority, and cleanup effect. Recommend using DOC-TRIAGE, stating uncertainty. The user decides per finding/group, including every `delete-doc` and `ask-human`.

State what the docs will stop claiming and where each claim will live instead.

## Step 3 — Clean up what was approved

```
Workflow({ name: 'housekeeping-cleanup', args: {
  startedAt: '<MM-DD HH:mm>',
  dispositions: [ /* approved findings only; verbatim step-1 ids */ ],
  chronicleDir: '~/.agent-state/<repo-slug>/housekeeping/chronicles',
} })
```

One editor per file; a different agent verifies each edit introduced no new claim. Route `skipped` findings (`fix-code`, `file-ticket`, `ask-human`) yourself. Show the diff; nothing is committed.

## Step 4 — Close the gaps

Code defects, missing decisions, and missing documents become tickets per FILING: search for duplicates, one ticket per work item, evidence + `path:line`, and `triage` readiness for agent work. **Always ask before posting**, showing exact titles and bodies.

## Step 5 — Sweep the code, then plan with the user

```
Workflow({ name: 'housekeeping-sweep', args: {
  startedAt: '<MM-DD HH:mm>',
  lenses: null,                // full SWEEP catalogue
  docsAreTrue: true,           // steps 1–3 completed
  intendedArchitecture: '<what the ADRs state>',
  checks: { build: '<build cmd>', test: '<test cmd>', lint: '<lint cmd>' },
  maxLenses: 6, reserve: 40000,
} })
```

The user routes verified, sized candidates (`now`/`ticket`/`drop`). Hand do-now work to `go-go-go`, `nights-watch` RANGING, or `nightshift`; file the rest through FILING.

## Reporting

Lead with gaps, then changes:

- `uncovered` from every dispatch; never describe unexamined areas as clean.
- **Not run**, separately: an executable claim is grounded only by running it and showing the real output. Source/code citations cannot substitute; withhold unrun claims from findings and give the reason and settling command.
- Doc findings by kind, deletions and replacement authorities, refuted findings.
- Ticket links, user-deferred items, ordered sweep work and handoffs.

## Lines this skill does not cross

- Never edit authoritative externals, transition their tickets, or comment on their boards; report errors to the human owner.
- No deletion without an approved source of truth; cleanup rejects missing authority.
- Supersede ADRs; never rewrite history to match the present.
- Nothing filed, committed, pushed, or merged without the user; scripts provide no such code paths.
