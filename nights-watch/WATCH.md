# The Watch — loop mechanics, dispatch script, token economics

## Standing watch (the loop)

The Watch runs as a self-pacing loop (`/loop` dynamic mode / ScheduleWakeup where available; otherwise a cron/scheduled agent, or manual re-invocation with `once`). Pacing:

- **Workflow in flight** → long fallback wake (~1800 s); the workflow's completion notification is the real signal, the wake-up is insurance.
- **Empty muster** → idle tick every 20–30 min. Trackers don't change faster than that at night.
- **Budget exhausted or user stands you down** → stop the loop explicitly; on stand-down, release still-claimed tickets back to the ready label with a comment.

The watcher carries almost nothing between patrols on purpose: the tracker labels are the state machine, and the journal is the memory. Any fresh context can take the next patrol from those two alone.

## Dispatch — the 3-worker pool

One Workflow per patrol. Concurrency 3 is enforced structurally: three workers drain a shared queue, so at most three tickets are ever in flight regardless of muster size. Adapt this template (plain JS, no TS):

```js
export const meta = {
  name: 'nights-watch-patrol',
  description: 'Work triaged AI-ready tickets: 3-worker pool, tiered models, budget-guarded',
  phases: [{ title: 'Rangers' }],
}
// args: { tickets: [{id, url, title, tier, effort, repo, brief}], reserve: 60000 }
const queue = [...args.tickets]
const results = []
phase('Rangers')
await parallel([1, 2, 3].map(w => async () => {
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
       Work on a new branch named nw/${t.id}. Implement to the ticket's acceptance criteria,
       with tests where the repo has a test convention. Commit, push, and open a PR that
       references the ticket. If the ticket turns out under-specified or needs a human
       decision, STOP and return {blocked: true, reason} instead of guessing.
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

- **`isolation: 'worktree'`** because up to three workers mutate the same repo concurrently. Single-ticket muster → drop it and let the one worker use the working tree.
- **`model: t.tier`** comes from triage ([TRIAGE.md](TRIAGE.md)), never hardcoded to the session tier. Escalation retries are a *second* `agent()` call by the watcher after reading results — keep the pool itself simple.
- The queue-shift pool means a fast haiku chore doesn't hold a slot while an opus ticket grinds — workers rebalance naturally.
- The watcher, not the workers, updates tracker labels/comments from `results` — workers get no tracker-write instructions, which keeps the report step consistent and idempotent.

## Token watching

The Watch treats tokens like the Wall treats firewood: counted, planned, never wasted.

- **Reserve per ticket.** Estimate conservatively (~60k output tokens for a sonnet ticket; halve for haiku, triple for opus — recalibrate from your own journal, below). A worker isn't started unless the remaining budget covers its reserve.
- **Plan the wave, don't discover the wall.** Before dispatch, if `budget.total` is set: max tickets this patrol ≈ `budget.remaining() / avg reserve`. Triage the whole muster but dispatch only what fits; defer the rest with a log line and leave them `ai-ready` (unclaimed) so nothing sits claimed-but-starved.
- **Journal the actuals.** After each patrol, record per-ticket spend (`budget.spent()` deltas around the workflow, or the workflow journal) next to its tier. Over a few nights this yields real per-tier costs — use them to sharpen both the reserve numbers and the triage rubric (tickets that consistently blow their tier's reserve were mis-tiered).
- **No budget set** → the reserve guard is inert, but the journal still records spend; the Watch's minimalism (tiering + cap of 3) is the economy, not the ceiling.

## The watch journal

Append one entry per patrol to `nights-watch-journal.md` (repo root, or the path the user configures):

```md
## Patrol <n> — <tickets mustered>/<triaged ready>/<dispatched>
- <ticket id> [tier] → done <PR url> | blocked: <reason> | deferred: <reason> (~<n>k tokens)
- muster empty ×<n> (if so)
- budget: <spent>k spent / <target or none>
```

The journal is the Watch's memory across contexts and its calibration data for token reserves. Keep entries terse — it's a logbook, not a saga.
