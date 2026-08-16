---
name: housekeeping
description: 'Audit a repository''s documentation against the code and against read-only external sources (Confluence, Jira, Azure DevOps). Separates drift (doc and code disagree), bloat (the doc restates code, so it will go stale), and gaps. Names the source of truth per claim; a human approves before anything is deleted or filed. Then sweeps the code — warnings, test gaps, duplication, architecture drift — into verified, sized work items. Use for "housekeeping", "tidy up the repo", "are our docs still true", a documentation audit, or /housekeeping.'
---

# Housekeeping

Get the map to match the territory, then fix the territory. **In that order**, because every later
step trusts the docs: a sweep that judges code against drifted documentation measures it against a
system nobody built.

## Reference docs

- [DOC-TRIAGE.md](DOC-TRIAGE.md) — **the doctrine**: the source-of-truth ladder, drift vs bloat vs
  gap, what each document type is *for*, and the dispositions. Read before adjudicating.
- [FILING.md](FILING.md) — turning a gap or a work item into a ticket a stranger can pick up, on
  GitHub / Azure DevOps / Jira, without duplicating what the board already has.
- [SWEEP.md](SWEEP.md) — the code-hygiene half: the lenses, what counts as evidence, and how items
  get routed to now / ticket / drop.

## Step 0 — Right-size, then isolate

Housekeeping is a *pass over a repository*, not a fix for one file. One stale paragraph → just fix
it. Then check three things and say what you found:

- **Worktree.** Dispatch from a dedicated worktree + branch (`EnterWorktree`) so the main checkout
  stays clean and a rejected cleanup is `rm -rf`, not a revert.
- **Externals.** Which authoritative sources exist and how to reach them — Confluence space, Jira
  project, Azure DevOps wiki/boards, an MCP server, a URL. These are **read-only, always**.
- **Tracker.** Where issues get filed, and its conventions. Ask if it is not obvious from the repo.

## Step 1 — Audit the documentation (read-only)

```
Workflow({ name: 'housekeeping-audit', args: {
  startedAt: '<MM-DD HH:mm — the script has no clock>',
  paths: null,                 // null → it inventories the doc surface itself
  includeComments: true,       // prose comments in code are documentation and drift like it
  externals: [{ name: 'Confluence: Platform space', how: '<MCP tool / CLI / URL>' }],
  maxShards: 6, perShard: 8, reserve: 40000,
  chronicleDir: '.housekeeping/chronicles',
  tiers: { inventory: 'haiku', audit: 'sonnet', verify: 'sonnet', consolidate: 'sonnet' },
} })
```

Shards are cut **by code area**, so the README and the ADR that contradict each other land with the
same auditor. Every finding is refute-verified; the script has **no write path at all**.

> **Running against a repo other than this one** — which is the normal case here. Named resolution
> reads `.claude/workflows/` in the *current* repo, so pass `scriptPath` at this repo's copy
> (`<skills-repo>/.claude/workflows/housekeeping-audit.js`) instead of `name`. Same for the other two.

Read `uncovered` before anything else. A dead auditor means part of the surface was never looked
at, and reporting that as clean documentation is the one failure that makes the run worse than not
running it.

## Step 2 — Adjudicate the source of truth — ALWAYS ASK

**The gate. Never skipped, never batched into a silent default.** Present the findings grouped by
disposition — worst kind first, `bloat` last — each with the doc, the reality, the proposed source
of truth, and what cleanup would do. The user decides per finding or per group.

Use [DOC-TRIAGE.md](DOC-TRIAGE.md) to make the recommendation, and say plainly where you are unsure.
Two things are worth a human's attention every time:

- **Every `delete-doc`.** Deletion is invisible to the reader who needed the paragraph and never
  knew it existed. If nobody can name who reads it, that is evidence — but it is the user's call.
- **Anything the audit marked `ask-human`.** That is the process working. Do not resolve it yourself
  to keep the run moving.

Then, out loud: *what the docs will no longer claim, and what will hold each of those claims instead.*

## Step 3 — Clean up what was approved

```
Workflow({ name: 'housekeeping-cleanup', args: {
  startedAt: '<MM-DD HH:mm>',
  dispositions: [ /* ONLY the approved findings, verbatim ids from step 1 */ ],
  chronicleDir: '.housekeeping/chronicles',
  tiers: { edit: 'sonnet', check: 'sonnet' },
} })
```

One editor per file (parallel edits to one file lose one of them), and a **different** agent checks
each edit — the failure mode is a cleanup that removes old drift by inventing a new claim, and it
looks like success in the report. `fix-code`, `file-ticket` and `ask-human` are not executable here;
they come back in `skipped` and are yours to route. Nothing is committed — show the user the diff.

## Step 4 — Close the gaps

Drift the docs cannot fix on their own — the code is wrong, a decision was never recorded, a whole
document is missing — becomes a ticket. Follow [FILING.md](FILING.md): search the tracker first, one
ticket per piece of work, evidence and `path:line` in the body, and the readiness bar from `triage`
if an agent may pick it up.

**ALWAYS ASK before posting.** Show the exact title and body of each. Posting to a tracker is
outward-facing and other people read it — which is precisely why no script in this skill can do it.

## Step 5 — Sweep the code, then plan with the user

```
Workflow({ name: 'housekeeping-sweep', args: {
  startedAt: '<MM-DD HH:mm>',
  lenses: null,                // null → the full catalogue in SWEEP.md
  docsAreTrue: true,           // steps 1–3 ran; the house rules can be trusted
  intendedArchitecture: '<what the ADRs actually state — not what you would prefer>',
  checks: { build: '<build cmd>', test: '<test cmd>', lint: '<lint cmd>' },
  maxLenses: 6, reserve: 40000, tiers: { lens: 'sonnet', verify: 'sonnet', plan: 'sonnet' },
} })
```

It returns verified candidates grouped into sized work items with a `now` / `ticket` / `drop`
recommendation. **The user routes them** — that is the whole point of the step. Do-now items hand
off to `go-go-go` (one thing, now), `nights-watch` in RANGING mode (one item, by the book), or `nightshift`
(a batch overnight); the rest go through [FILING.md](FILING.md).

## Reporting

Lead with what is *not* covered, then what changed:

- **`uncovered`** from every dispatch — surface nobody examined. Never round it to clean.
- **Docs**: findings by kind, what was deleted and what now holds those claims, what was refuted.
- **Filed**: ticket links. **Deferred**: what the user chose to leave, so it is not re-litigated.
- **Sweep**: work items, ordered, with the do-now ones started or handed off.

## Lines this skill does not cross

- **Authoritative externals are read-only.** Never edit a Confluence page, transition a Jira ticket,
  or comment on a board — even when the audit proves it wrong. Report it; a human owns that system.
- **No deletion without an approved source of truth.** The cleanup script rejects a `delete-doc`
  that has none rather than guessing.
- **No ADR is edited into agreement with the present.** Supersede it; the history is the value.
- **Nothing is filed, committed, pushed or merged without the user.** The scripts have no code path
  for any of it — the absence is the guarantee, not a promise in a prompt.
