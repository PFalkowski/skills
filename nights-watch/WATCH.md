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
  phases: [{ title: 'Rangers' }, { title: 'Grill' }],
}
// args: { tickets: [{id, url, title, tier, effort, repo, brief, process,
//                     chroniclePath,          // one FILE — the lone ranger's field notes
//                     chronicleDir}],         // a DIR — opus only; the workhorse writes one file per agent
//         libraryIndex: '<repo>/.nights-watch/library/INDEX.md',
//         workhorsePath: '<abs path to the skills repo>/.claude/workflows/sdlc-workhorse.js',
//         parallel: 1, maxWorkers: 3, reserve: 60000 }
// Normalize args first: it can arrive as a JSON-encoded STRING rather than an object,
// in which case `args.tickets` is undefined and the spread below throws before any
// ranger runs. Parse defensively and fail loudly on a malformed brief — a patrol that
// proceeds with undefined paths scatters chronicles instead of stopping (see #46).
const A = typeof args === 'string' ? JSON.parse(args) : args
if (!A || !Array.isArray(A.tickets)) throw new Error('patrol: args.tickets missing or not an array')
for (const t of A.tickets) {
  if (!t.id || !t.repo) throw new Error(`patrol: ticket missing id/repo: ${JSON.stringify(t)}`)
}
const queue = [...A.tickets]
const results = []
const poolSize = Math.max(1, Math.min(A.parallel ?? 1, A.maxWorkers ?? 3, queue.length))
phase('Rangers')
await parallel(Array.from({ length: poolSize }, (_, i) => i + 1).map(w => async () => {
  while (queue.length) {
    if (budget.total && budget.remaining() < A.reserve) {
      log(`worker ${w}: standing down, ${Math.round(budget.remaining()/1000)}k left < reserve`)
      break
    }
    const t = queue.shift()
    if (!t) break

    // opus-tier: the lifecycle is a Workflow, so the SCRIPT starts it. A ranger cannot:
    // an agent() inside a Workflow has no Workflow tool. See TRIAGE.md § Process assignment.
    if (t.tier === 'opus') {
      if (!A.workhorsePath) {
        results.push({ id: t.id, blocked: true, reason: 'opus-tier ticket but no workhorsePath configured',
                       summary: 'cannot dispatch sdlc-workhorse' })
        continue
      }
      try {
        const wh = await workflow({ scriptPath: A.workhorsePath }, {
          goal: `${t.title}\n\n${t.brief}\n\nTicket: ${t.url} (repo ${t.repo})\n\n` +
            `Stealth in the field (nights-watch Oath rule 8): write no code comments beyond ` +
            `what this repo's own house rules require (default to none). Nothing in commit ` +
            `messages, PR title, or PR description names the Watch, nights-watch, or "ranger", ` +
            `or otherwise reveals this was done by an automated process.`,
          parallel: 1, reserve: A.reserve,
          chronicleDir: t.chronicleDir, libraryIndex: A.libraryIndex,
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
       First read the Library index at ${A.libraryIndex} and open ONLY the entries
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
       Do NOT review your own diff for the record — the grill is not your job and you
       cannot run it (you have no Agent/Task tool to spawn a reviewer with). The patrol
       script dispatches a fresh reviewer against your PR after you return.
       Stealth in the field (Oath rule 8): write no code comments beyond what this repo's
       own house rules require (check for a documented convention, e.g. Arrange-Act-Assert;
       default to none). Nothing in your commit messages, PR title, or PR description names
       the Watch, nights-watch, or "ranger", or otherwise reveals this was done by an
       automated process — write them as any contributor would, describing only the change.
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
    const res = r ?? { id: t.id, blocked: true, reason: 'worker died', summary: 'no result' }
    // THE GRILL — a second, script-dispatched agent(). This call is made by the SCRIPT,
    // not by the ranger, which is the whole point: a ranger has no Agent/Task tool and
    // cannot spawn a reviewer, so a grill written into its prompt degrades to self-review.
    // Dispatched here, the reviewer is genuinely fresh — it never saw the ranger's
    // rationale, only what this prompt hands it. Skipped for blocked/PR-less results and
    // for the workhorse branch above (which `continue`s past this, carrying its own grill).
    if (!res.blocked && res.prUrl) {
      const g = await agent(
        `You are a code reviewer. Review the pull request ${res.prUrl} (repo ${t.repo}).
         You did not write this code and must not assume the author's reasoning was sound.
         Run the "code-review-grill" skill as a SINGLE adversarial reviewer (you have no
         Agent tool, so a quorum is not available — do not attempt to spawn one).
         Read the repo's own docs first (README, docs/adr, contributing/coding guidelines)
         and judge the diff against THIS project's documented conventions.
         Grill it hunk by hunk: what must be true for this to be correct? what input breaks
         it? what caller relied on the old behavior? Verify every finding before reporting
         it — a runnable snippet with its output, an in-repo citation (path:line), or an
         authoritative link. Speculation is not a finding; drop it.
         Ticket context (all you get — do not ask the author): ${t.title}
         ${t.brief}
         Post the confirmed findings to the PR as an ordinary review. Write as any reviewer
         would: nothing in the review names the Watch, nights-watch, "ranger", the grill, or
         otherwise reveals an automated process (Oath rule 8).
         Return JSON: {reviewed, findingsPosted, blocking, summary}.`,
        { label: `grill:${t.id}`, phase: 'Grill', model: t.tier, effort: t.effort,
          schema: { type: 'object',
            properties: { reviewed: {type:'boolean'}, findingsPosted: {type:'number'},
              blocking: {type:'boolean'}, summary: {type:'string'} },
            required: ['reviewed','findingsPosted','blocking','summary'] } }
      )
      // An un-run gate must be visible, never assumed: no grill result = not ai-done.
      res.grill = g ?? { reviewed: false, findingsPosted: 0, blocking: false,
                         summary: 'grill agent died' }
      res.grilled = !!(g && g.reviewed)
    }
    results.push(res)
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
- **The workhorse's own grill satisfies the review gate.** Its per-slice fresh-agent grill already refute-tests every finding, so don't re-grill by reflex — that's paying twice for the same gate. Add a `code-review-grill` quorum only when its report shows no review ran. The opus branch `continue`s before the grill stage for exactly this reason: workhorse tickets are grilled inside the child workflow, and passing them through the patrol's grill stage as well would double-pay. (It would also have nothing to grill at that point — the workhorse never pushes, so there is no PR until the watcher opens one at report time.)

- **The grill is dispatched by the script, not by the ranger — and it has to be.** This is the fix for [#46](https://github.com/PFalkowski/skills/issues/46), where 9 rangers across 3 patrols each discovered the same wall independently. An `agent()` running inside a Workflow has **no `Agent`/`Task` tool** — `ToolSearch` from in there surfaces only `TaskStop`/`EnterWorktree`/`SendMessage`/`CronCreate`/`PushNotification` (verified again while writing this). So a ranger told to "grill your diff with a fresh reviewer" cannot comply: the best it can do is review its own diff and disclose the substitution, which is the one thing the gate exists to prevent — an author grading their own work never catches a flaw in their own *reasoning*. The script's own `agent()` calls are not nested spawns, so moving the grill one level up to where the pool already lives costs nothing and restores the real guarantee. Verified: a script-dispatched second-stage agent has no knowledge of the first stage's context, and holds `Skill` (with `code-review-grill` listed) plus `Bash`/`gh` to post the review.

- **Single reviewer, never a quorum, inside the pool.** For the same reason: the grill agent can't spawn subagents either, so `code-review-grill`'s quorum mode is unavailable to it. One adversarial reviewer is the gate at ranger tiers. A quorum needs a caller that holds `Agent` — the watcher itself, after the patrol, on a ticket load-bearing enough to deserve it.

- **Normalize `args` before touching it, and fail loudly.** `args` can reach the script as a **JSON-encoded string** rather than the object you passed — reproduced live while writing this fix, and the second finding in [#46](https://github.com/PFalkowski/skills/issues/46), where it left `repo`/`base`/`chronicleDir` as the literal `undefined` in every ranger prompt and scattered chronicles across five invented directories. `typeof args === 'string' ? JSON.parse(args) : args` costs one line and makes the template robust either way. The validation that follows is the other half: a patrol that throws on a malformed brief is debuggable, while one that proceeds with `undefined` paths does a night's work into the wrong place and reports success.

- **`grilled` gates `ai-done`.** The watcher labels `ai-done` only for results carrying `grilled: true`. A ticket whose grill agent died comes back with `grilled: false` and a summary saying so — report it as blocked-on-review rather than done, because an un-run gate must be visible. Silence here is exactly the failure #46 describes: a patrol reporting "all grilled" while the gate ran degraded all night.

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
