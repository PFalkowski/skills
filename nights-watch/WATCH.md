# The Watch — loop mechanics, dispatch script, token economics

## Concurrency knobs

- **`parallel`** — tickets in flight at once. **Default 1**: the Watch works one ticket at a time unless the user raises it.
- **`max-workers`** — hard cap on the pool. **Default 3**. `parallel` is always clamped to it; raising `parallel` past 3 requires the user to raise `max-workers` explicitly too.

Both are user-configurable per invocation (or in the standing loop's brief); the defaults are the Watch's minimalism, not a technical limit.

## Standing watch (the loop)

The Watch runs as a self-pacing loop (`/loop` dynamic mode / ScheduleWakeup where available; otherwise a cron/scheduled agent, or manual re-invocation with `once`). Pacing:

- **Workflow in flight** → long fallback wake (~1800 s); the workflow's completion notification is the real signal, the wake-up is insurance.
- **Empty muster** → idle tick every 20–30 min. Trackers don't change faster than that at night.
- **Budget exhausted or user stands you down** → stop the loop explicitly; on stand-down, release still-claimed tickets back to the ready label with a comment.

The watcher carries almost nothing between patrols on purpose: the tracker labels are the state machine, the journal is the logbook, and the Library ([LIBRARY.md](LIBRARY.md)) is the long-term memory. Any fresh context can take the next patrol from those three alone.

## Dispatch — the worker pool

One Workflow per patrol. Concurrency is enforced structurally: `poolSize` workers drain a shared queue, so at most that many tickets are ever in flight regardless of muster size. Adapt this template (plain JS, no TS):

```js
export const meta = {
  name: 'nights-watch-patrol',
  description: 'Work triaged AI-ready tickets: bounded worker pool, tiered models, budget-guarded',
  phases: [{ title: 'Rangers' }],
}
// args: { tickets: [{id, url, title, tier, effort, repo, brief, process,
//                     chroniclePath,          // one FILE — the lone ranger's field notes
//                     chronicleDir}],         // a DIR — opus only; the workhorse writes one file per agent
//         libraryIndex: '<repo>/.nights-watch/library/INDEX.md',
//         workhorsePath: '<abs path to the skills repo>/.claude/workflows/sdlc-workhorse.js',
//         parallel: 1, maxWorkers: 3, reserve: 60000 }
const queue = [...args.tickets]
const results = []
const poolSize = Math.max(1, Math.min(args.parallel ?? 1, args.maxWorkers ?? 3, queue.length))
phase('Rangers')
await parallel(Array.from({ length: poolSize }, (_, i) => i + 1).map(w => async () => {
  while (queue.length) {
    if (budget.total && budget.remaining() < args.reserve) {
      log(`worker ${w}: standing down, ${Math.round(budget.remaining()/1000)}k left < reserve`)
      break
    }
    const t = queue.shift()
    if (!t) break

    // opus-tier: the lifecycle is a Workflow, so the SCRIPT starts it. A ranger cannot:
    // an agent() inside a Workflow has no Workflow tool. See TRIAGE.md § Process assignment.
    if (t.tier === 'opus') {
      if (!args.workhorsePath) {
        results.push({ id: t.id, blocked: true, reason: 'opus-tier ticket but no workhorsePath configured',
                       summary: 'cannot dispatch sdlc-workhorse' })
        continue
      }
      try {
        const wh = await workflow({ scriptPath: args.workhorsePath }, {
          goal: `${t.title}\n\n${t.brief}\n\nTicket: ${t.url} (repo ${t.repo})`,
          parallel: 1, reserve: args.reserve,
          chronicleDir: t.chronicleDir, libraryIndex: args.libraryIndex,
        })
        // The workhorse commits but NEVER pushes or opens a PR — that line is enforced by
        // absence in its script. The watcher opens the PR from its branch (see below).
        results.push({ id: t.id, via: 'sdlc-workhorse', prUrl: null, needsPr: !!wh.mergeReady,
          blocked: !wh.mergeReady, reason: wh.mergeReady ? null : (wh.mergeBlockedBy || []).join('; ') || wh.stoppedAt || 'not merge-ready',
          summary: `workhorse: ${wh.mergeReady ? 'merge-ready' : 'blocked'}`, report: wh })
      } catch (e) {
        results.push({ id: t.id, blocked: true, reason: `workhorse dispatch failed: ${String(e && e.message || e)}`,
                       summary: 'workhorse did not run' })
      }
      continue
    }

    const r = await agent(
      `You are a ranger of the Night's Watch working ticket ${t.id} (${t.url}) in repo ${t.repo}.
       Brief: ${t.brief}
       First read the Library index at ${args.libraryIndex} and open ONLY the entries
       relevant to this ticket (conventions, gotchas, tooling for this repo).
       Keep a chronicle at ${t.chroniclePath} (absolute path, outside your worktree):
       append field notes THE MOMENT you learn something — a convention discovered, a trap
       hit, a command that finally worked, an assumption that proved false — not at the end.
       Work on a new branch named nw/${t.id}.
       Process (assigned at triage — mandatory): ${t.process}
       - haiku-tier: direct change, verified by build/tests.
       - sonnet-tier: the "nightshift" skill's LOOP discipline — TDD Red → Green → Refactor;
         an unresolvable question means return blocked, never guess.
       Truth before all: at every critical decision moment — a root-cause call, a design
       fork, before any unverified fact (API behavior, version/compat, copied number)
       enters code — run the "fact-check" skill: decompose the decision into smaller
       verifiable sub-claims and prove each (runnable experiment + output, or independent
       authoritative sources). Unprovable = false. Refuted premise = return blocked with
       the evidence; proven facts carry their proof into the PR.
       Before opening the PR, run the "code-review-grill" skill on your diff with a FRESH
       reviewer agent (never share your rationale with it); fix confirmed findings, post
       the review to the PR.
       Commit, push, and open a PR that references the ticket. If the ticket turns out
       under-specified or needs a human decision, STOP and return {blocked: true, reason}
       instead of guessing.
       Return JSON: {id, prUrl|null, blocked, reason|null, summary}.`,
      { label: `ranger:${t.id}`, phase: 'Rangers', model: t.tier, effort: t.effort,
        isolation: 'worktree',
        schema: { type: 'object',
          properties: { id: {type:'string'}, prUrl: {type:['string','null']},
            blocked: {type:'boolean'}, reason: {type:['string','null']}, summary: {type:'string'} },
          required: ['id','blocked','summary'] } }
    )
    results.push(r ?? { id: t.id, blocked: true, reason: 'worker died', summary: 'no result' })
  }
}))
const unworked = queue.map(t => t.id)
if (unworked.length) log(`deferred (budget/stand-down): ${unworked.join(', ')}`)
return { results, unworked }
```

Notes on the template:

- **`isolation: 'worktree'`** matters only when `parallel > 1` (workers mutating the same repo concurrently). At the default `parallel=1`, drop it and let the lone ranger use the working tree.
- **`model: t.tier`** comes from triage ([TRIAGE.md](TRIAGE.md)), never hardcoded to the session tier. Escalation retries are a *second* `agent()` call by the watcher after reading results — keep the pool itself simple.
- The queue-shift pool means a fast haiku chore doesn't hold a slot while an opus ticket grinds — workers rebalance naturally.
- The watcher, not the workers, updates tracker labels/comments from `results` — workers get no tracker-write instructions, which keeps the report step consistent and idempotent.
- **`opus` tickets take the `workflow()` branch, not the `agent()` one**, because [`sdlc-workhorse`](../sdlc-workhorse/SKILL.md) is a Workflow and a ranger has no `Workflow` tool to start one with. This is the single level of nesting `workflow()` allows — the workhorse script itself calls no `workflow()`, so the budget holds and nothing throws. Both branches share the pool, the queue, and the budget.
- **`workhorsePath`, not `{name:}`.** Named resolution reads `.claude/workflows/` in the repo the patrol is *running in* — almost never this one. Pass an absolute `scriptPath` to this repo's copy. Without it, opus tickets return blocked rather than silently degrading to a lesser process: an un-run gate is visible, a skipped one is not.
- **The watcher opens the PR for workhorse tickets.** The workhorse commits but never pushes, publishes, or merges — that line is enforced by absence in its script, and the patrol must not smuggle it back in through the ranger prompt. So a `needsPr` result is the watcher's job: push the branch, open the PR referencing the ticket, then label. Rangers on the other tiers still open their own PRs; only this tier splits the work.
- **The workhorse's own grill satisfies the review gate.** Its per-slice fresh-agent grill already refute-tests every finding, so don't re-grill by reflex — that's paying twice for the same gate. Add a `code-review-grill` quorum only when its report shows no review ran.

## Token watching

The Watch treats tokens like the Wall treats firewood: counted, planned, never wasted.

- **Reserve per ticket.** Estimate conservatively (~60k output tokens for a sonnet ticket; halve for haiku, triple for opus — recalibrate from your own journal, below). A worker isn't started unless the remaining budget covers its reserve.
- **Plan the wave, don't discover the wall.** Before dispatch, if `budget.total` is set: max tickets this patrol ≈ `budget.remaining() / avg reserve`. Triage the whole muster but dispatch only what fits; defer the rest with a log line and leave them `ai-ready` (unclaimed) so nothing sits claimed-but-starved.
- **Journal the actuals.** After each patrol, record per-ticket spend (`budget.spent()` deltas around the workflow, or the workflow journal) next to its tier. At the fire, fold these into `calibration` entries in the Library ([LIBRARY.md](LIBRARY.md)) — over a few nights this yields real per-tier costs; use them to sharpen both the reserve numbers and the triage rubric (tickets that consistently blow their tier's reserve were mis-tiered).
- **No budget set** → the reserve guard is inert, but the journal still records spend; the Watch's minimalism (tiering + one-ticket-at-a-time default) is the economy, not the ceiling.

## The watch journal

Append one entry per patrol to `.nights-watch/journal.md` (or the path the user configures — see [LIBRARY.md](LIBRARY.md) for the full `.nights-watch/` layout):

```md
## Patrol <n> — <tickets mustered>/<triaged ready>/<dispatched>
- <ticket id> [tier] → done <PR url> | blocked: <reason> | deferred: <reason> (~<n>k tokens)
- muster empty ×<n> (if so)
- budget: <spent>k spent / <target or none>
```

The journal is the Watch's memory across contexts and its calibration data for token reserves. Keep entries terse — it's a logbook, not a saga.
