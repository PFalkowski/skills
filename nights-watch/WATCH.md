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

The watcher carries almost nothing between patrols on purpose: the tracker labels are the state machine, and the journal is the memory. Any fresh context can take the next patrol from those two alone.

## Dispatch — the worker pool

One Workflow per patrol. Concurrency is enforced structurally: `poolSize` workers drain a shared queue, so at most that many tickets are ever in flight regardless of muster size. Adapt this template (plain JS, no TS):

```js
export const meta = {
  name: 'nights-watch-patrol',
  description: 'Work triaged AI-ready tickets: bounded worker pool, tiered models, budget-guarded',
  phases: [{ title: 'Rangers' }],
}
// args: { tickets: [{id, url, title, tier, effort, repo, brief, process}],
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
    const r = await agent(
      `You are a ranger of the Night's Watch working ticket ${t.id} (${t.url}) in repo ${t.repo}.
       Brief: ${t.brief}
       Work on a new branch named nw/${t.id}.
       Process (assigned at triage — mandatory): ${t.process}
       - haiku-tier: direct change, verified by build/tests.
       - sonnet-tier: the "nightshift" skill's LOOP discipline — TDD Red → Green → Refactor;
         an unresolvable question means return blocked, never guess.
       - opus-tier: run the "sdlc-old-fashioned" skill end to end.
       Unconditionally: run the "fact-check" skill before any unverified external fact
       (API behavior, version/compat, copied number) enters code — refuted fact = blocked.
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

## Token watching

The Watch treats tokens like the Wall treats firewood: counted, planned, never wasted.

- **Reserve per ticket.** Estimate conservatively (~60k output tokens for a sonnet ticket; halve for haiku, triple for opus — recalibrate from your own journal, below). A worker isn't started unless the remaining budget covers its reserve.
- **Plan the wave, don't discover the wall.** Before dispatch, if `budget.total` is set: max tickets this patrol ≈ `budget.remaining() / avg reserve`. Triage the whole muster but dispatch only what fits; defer the rest with a log line and leave them `ai-ready` (unclaimed) so nothing sits claimed-but-starved.
- **Journal the actuals.** After each patrol, record per-ticket spend (`budget.spent()` deltas around the workflow, or the workflow journal) next to its tier. Over a few nights this yields real per-tier costs — use them to sharpen both the reserve numbers and the triage rubric (tickets that consistently blow their tier's reserve were mis-tiered).
- **No budget set** → the reserve guard is inert, but the journal still records spend; the Watch's minimalism (tiering + one-ticket-at-a-time default) is the economy, not the ceiling.

## The watch journal

Append one entry per patrol to `nights-watch-journal.md` (repo root, or the path the user configures):

```md
## Patrol <n> — <tickets mustered>/<triaged ready>/<dispatched>
- <ticket id> [tier] → done <PR url> | blocked: <reason> | deferred: <reason> (~<n>k tokens)
- muster empty ×<n> (if so)
- budget: <spent>k spent / <target or none>
```

The journal is the Watch's memory across contexts and its calibration data for token reserves. Keep entries terse — it's a logbook, not a saga.
