export const meta = {
  name: 'manager',
  description: 'Run the manager as a fresh subagent (subagent mode): ledger, verify, decide, dispatch.',
  phases: [
    { title: 'Ledger', detail: 'a fresh manager reads the mandate and outputs and ledgers every claim, decision, ask and open item' },
    { title: 'Verify', detail: 'the script dispatches a fresh fact-check per load-bearing claim' },
    { title: 'Decide', detail: 'a fresh manager decides each item under the mandate and returns the routed follow-ups' },
  ],
}
// args: {
//   mandate: { goal, merge, approvals, post, tickets, reply, resolve, cleanup, budget, hard, tracker },
//   subject: 'PR #515',                       // what is being managed
//   outputs: ['<pasted report>', ...],        // one or more agent outputs to manage
//   repo: '/abs/path',                        // the repo the work lives in
//   startedAt: '11-27 12:00',                 // the dispatcher's clock — there is none in here
//   libraryIndex: null,                       // nights-watch Library index, when the repo keeps one
//   tiers: { manager: 'opus', verify: 'opus' },
//   local: false,                             // true in a CLAUDE_LOCAL session — never fan out
// }
//
// SUBAGENT MODE. This script is how a working session gets an independent manager. Session mode —
// the human starts a manager session — uses the skill directly: that session is the manager, spawns
// every leg itself, and never does the work; it does not use this script for the decision.
//
// THE MANAGER IS NEVER THE AUTHOR (subagent mode). Every agent below is a fresh context that
// did not write the work under management and holds none of its authoring context. The calling
// session is only the dispatcher and relay: it gathers the mandate and outputs, runs this Workflow,
// executes the follow-ups the manager routes, feeds their results into the next pass, and reports.
//
// THE WALL (PFalkowski/skills#46): an agent() inside a Workflow has no Agent/Task/Workflow tool and
// cannot spawn — and nothing throws when it tries; it role-plays the missing subagents. So the
// script does the only fan-out this pass needs (one fresh fact-check per load-bearing claim), and
// every other follow-up is RETURNED for the calling session, which holds the tools to dispatch a
// skill or start a Workflow. Asking the decide agent to spawn a reviewer or a lifecycle would
// silently degrade it to self-work, which is the defect this whole change exists to prevent.
//
// The manager decides; the dispatcher executes. A decision the manager returns is not a decision
// the manager enacted — the dispatcher runs it and hands the result to the next manager pass.

// Some hosts deliver `args` as an unparsed JSON string rather than the object the contract
// promises; this is a no-op when args already arrives parsed. Without it every args.* read is
// undefined and the manager silently manages nothing.
if (typeof args === 'string') args = JSON.parse(args)

const startedAt = args.startedAt || ''
const say = (m) => log(startedAt ? `[${startedAt}] ${m}` : m)

// A local-model session serves one request at a time. The verification fan-out must not run in
// parallel there, or every agent waits on one GPU while the run looks hung.
const localSession = args.local === true ||
  (args.local !== false && typeof process !== 'undefined' && process.env && process.env.CLAUDE_LOCAL === '1')
const runAll = thunks => localSession
  ? thunks.reduce(async (acc, t) => { const out = await acc; out.push(await t()); return out }, Promise.resolve([]))
  : parallel(thunks)

const mandate = args.mandate || {}
if (!mandate.goal || !String(mandate.goal).trim()) {
  throw new Error('manager: args.mandate.goal is required — a manager without a goal has no referent for "aligned".')
}
const subject = args.subject || '(the work described in the outputs)'
const outputs = [].concat(args.outputs || []).filter(o => typeof o === 'string' && o.trim())
if (!outputs.length) {
  throw new Error('manager: args.outputs is required — paste at least one report to manage.')
}

const NO_SPAWN = `You are the ONLY agent on your task. You have no Agent, Task or Workflow tool — do
NOT try to convene subagents, spawn anything or delegate; anything that appears to work is
role-play. Do the work yourself, in this context.`

const NO_HUMAN = `There is NO human attached to this run. Every question to "the user" is answered by
the mandate below; a hard line is returned as an escalation, never asked.`

// ---------------------------------------------------------------------------
// Schemas. The ledger separates the four things a report mixes: a claim (verify it), a
// decision-made (ratify or reverse it), an ask (answer it with one verdict), and an open item
// (account for it). Collapsing them is how an implicit "PR ready" request goes unanswered.
// ---------------------------------------------------------------------------
const LEDGER = { type: 'object', properties: {
  mandate: { type: 'string', minLength: 1 },
  items: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['claim', 'decision-made', 'ask', 'open-item', 'promise'] },
    text: { type: 'string', minLength: 1 },
    loadBearing: { type: 'boolean' },
    verifyHow: { type: ['string', 'null'] } },
    required: ['id', 'kind', 'text', 'loadBearing'] } },
  verifications: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', minLength: 1 },
    claim: { type: 'string', minLength: 1 },
    brief: { type: 'string', minLength: 1 },       // self-contained: a fresh agent never saw this report
    command: { type: ['string', 'null'] } },       // the command that would settle it
    required: ['id', 'claim', 'brief'] } },
  notes: { type: 'string' } },
  required: ['mandate', 'items', 'verifications'] }

const VERIFY = { type: 'object', properties: {
  holds: { type: 'boolean' },
  why: { type: 'string', minLength: 1 },
  evidence: { type: 'string', minLength: 1 },
  method: { type: 'string', minLength: 1 } },       // how it was checked, replicable in one step
  required: ['holds', 'why', 'evidence', 'method'] }

const DECIDE = { type: 'object', properties: {
  verdicts: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', minLength: 1 },
    verdict: { type: 'string', enum: ['APPROVE', 'REDIRECT', 'DEFER', 'ESCALATE', 'VETO'] },
    reason: { type: 'string', minLength: 1 },
    evidence: { type: 'string', minLength: 1 } },
    required: ['id', 'verdict', 'reason', 'evidence'] } },
  dispatches: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', minLength: 1 },
    skill: { type: 'string', minLength: 1 },
    why: { type: 'string', minLength: 1 },
    brief: { type: 'string', minLength: 1 },       // follows PRINCIPAL.md, ready to paste
    kind: { type: 'string', enum: ['agent', 'workflow'] } },   // workflow → the session starts a Workflow
    required: ['id', 'skill', 'why', 'brief', 'kind'] } },
  escalations: { type: 'array', items: { type: 'object', properties: {
    ask: { type: 'string', minLength: 1 },
    evidence: { type: 'string', minLength: 1 },
    recommendation: { type: 'string', minLength: 1 },
    hardLine: { type: 'string', minLength: 1 } },
    required: ['ask', 'evidence', 'recommendation'] } },
  journal: { type: 'array', items: { type: 'string' } },   // one line per decision, DECIDING.md format
  report: { type: 'string', minLength: 1 } },              // the few-line human report
  required: ['verdicts', 'dispatches', 'escalations', 'journal', 'report'] }

const EMPTY = (uncovered) => ({
  subject, mandate: '', ledger: [], verdicts: [], dispatches: [],
  escalations: [], journal: [], report: '', uncovered, complete: false,
})

// ---------------------------------------------------------------------------
// Phase 1 — Ledger. One fresh manager reads the mandate and outputs, runs the cheap checks itself,
// and says which deeper claims the script must dispatch. It does NOT decide: the decision waits for
// the evidence, so a dead verifier cannot be read as a green light.
// ---------------------------------------------------------------------------
phase('Ledger')
const ledger = await agent(
  `You are the MANAGER: a fresh principal who did NOT write the work under management and holds
   none of the author's context. Read the "manager" skill and its DECIDING.md and PRINCIPAL.md, and
   follow them in full.
   ${NO_HUMAN}
   MANDATE: ${JSON.stringify(mandate)}
   SUBJECT: ${subject}
   REPOSITORY: ${args.repo || '(the current repository)'}
   ${args.libraryIndex ? `LIBRARY INDEX: ${args.libraryIndex}` : ''}
   OUTPUT(S) TO MANAGE:
   ${outputs.map((o, i) => `--- output ${i + 1} ---\n${o}`).join('\n\n')}

   Step 1 — write the one-paragraph mandate: goal, done condition, assumptions, hard lines, budget.
   Step 2 — ledger EVERY item as claim / decision-made / ask (explicit or implicit) / open-item /
   promise. An implicit ask ("PR ready" = review/merge) is an ask. Mark the load-bearing items whose
   falsity would change the verdict.
   Step 3 — say how each load-bearing claim is verified. Run the cheap checks yourself with Bash/gh
   (gh pr checks, gh pr view --json state,reviews, ticket state) and put what you found in the item's
   text or in notes. For a deeper check the script must dispatch, add a self-contained entry to
   verifications: the claim, a brief a fresh fact-check agent can run without this report, and the
   command that would settle it. Treat an unverifiable load-bearing claim as false and say so.
   Add and verify the implicit claims: that custom code was needed (canonical before custom), and
   that the change covers every affected call site, not just the ticket's.
   Do NOT decide yet. Do NOT post and do NOT dispatch — this pass only produces the ledger.
   ${NO_SPAWN}
   Return the ledger.`,
  { label: 'ledger', phase: 'Ledger', model: args.tiers?.manager ?? 'opus', effort: 'high', schema: LEDGER })

if (!ledger) {
  say('ledger agent died — no output was managed')
  return EMPTY(['ledger agent died — the manager could not run'])
}

// ---------------------------------------------------------------------------
// Phase 2 — Verify. The SCRIPT dispatches a fresh fact-check per load-bearing claim: an agent that
// never read the report, because a claim verified by its own author is not verified. A dead
// verifier is recorded as unverified and handed to the decision as false — silence is never a pass.
// ---------------------------------------------------------------------------
phase('Verify')
const uncovered = []
const checks = ledger.verifications || []
const verified = await runAll(checks.map(v => () => (async () => {
  const fail = (why) => { uncovered.push(`verify ${v.id} (${v.claim}): ${why}`)
    return { id: v.id, claim: v.claim, holds: false, why: `unverified: ${why}`, evidence: '', method: '' } }
  try {
    const r = await agent(
      `You are a fresh fact-check agent. Confirm or refute this load-bearing claim for the manager.
       You did not write the work and you hold none of its authoring context.
       CLAIM: ${v.claim}
       BRIEF: ${v.brief}
       ${v.command ? `The command that would settle it: ${v.command}` : 'Find the cheapest check that settles it.'}
       Truth before all: an executable claim (what the code does at runtime) is grounded only by
       running it and showing the real output; a non-executable claim (an API contract, a library
       behaviour, a ticket state) is grounded by the exact path:line or an authoritative source.
       State the method you used so the manager can replicate it in one step.
       ${NO_SPAWN}
       Return whether it holds, why, the evidence, and the method.`,
      { label: `verify:${v.id}`, phase: 'Verify', model: args.tiers?.verify ?? 'opus', effort: 'medium',
        schema: VERIFY, isolation: 'worktree' })
    if (!r) return fail('verifier died — the claim is unverified')
    return { id: v.id, claim: v.claim, ...r }
  } catch (e) { return fail(`verifier threw — ${e && e.message ? e.message : e}`) }
})()))
say(`verify: ${verified.filter(v => v.holds).length}/${checks.length} claims held${uncovered.length ? `, ${uncovered.length} unverified` : ''}`)

// ---------------------------------------------------------------------------
// Phase 3 — Decide. A fresh manager decides each ask and decision-made item under the mandate. It
// publishes what it can itself (comments, tickets) and RETURNS the follow-ups it routes, because it
// cannot spawn: the dispatcher runs them and feeds their results into the next pass.
// ---------------------------------------------------------------------------
phase('Decide')
const decision = await agent(
  `You are the MANAGER: a fresh principal who did NOT write the work under management. Read the
   "manager" skill and its DECIDING.md and PRINCIPAL.md, and follow them in full.
   ${NO_HUMAN}
   MANDATE: ${JSON.stringify(mandate)}
   SUBJECT: ${subject}
   LEDGER: ${JSON.stringify(ledger)}
   VERIFICATION RESULTS: ${JSON.stringify(verified)}
   A claim that did not hold, or that is marked unverified because its verifier died, is FALSE. Say
   so wherever it changes a verdict.

   Decide every ask (explicit or implicit) and every decision-made item with exactly ONE verdict —
   APPROVE / REDIRECT / DEFER / ESCALATE / VETO — a one-line reason and an evidence pointer, using
   the rubric in DECIDING.md in order: premise verified → aligned → benefit against risk → mandate →
   hard line.
   Under the mandate, decide everything the mandate settles; escalate only the hard lines and what
   the mandate reserves. Publish every decision on its PR/ticket with manager attribution per post=;
   file deferred work per tickets= (a security finding first takes the disclosure gate). You may use
   Bash and gh for that. Do not merge a PR that is not green and independently grilled; under
   merge=ask, escalate it with the recommendation "merge".
   For each follow-up, route it to the right skill per the routing table and return a dispatch with
   a self-contained brief that follows PRINCIPAL.md. Mark kind 'workflow' for a skill that must run
   as a Workflow (sdlc-old-fashioned, the small-item sweep) — the calling session runs those; kind
   'agent' for the rest — the session dispatches those as subagents. A follow-up that needs a fresh
   reviewer is ALWAYS a dispatch, never something you do yourself.
   ${NO_SPAWN}
   Return verdicts, dispatches, escalations, one journal line per decision, and the few-line report
   to the human.`,
  { label: 'decide', phase: 'Decide', model: args.tiers?.manager ?? 'opus', effort: 'high', schema: DECIDE })

if (!decision) {
  say('decide agent died — no verdicts were reached')
  return { ...EMPTY(['decide agent died — the ledger was not decided']), mandate: ledger.mandate, ledger: ledger.items }
}

const complete = uncovered.length === 0
say(`manager: ${decision.verdicts.length} verdicts, ${decision.dispatches.length} routed, ${decision.escalations.length} escalated${complete ? '' : ' — INCOMPLETE'}`)

return {
  subject,
  mandate: ledger.mandate,
  ledger: ledger.items,
  verdicts: decision.verdicts,
  dispatches: decision.dispatches,   // the dispatcher runs these and feeds the results into the next pass
  escalations: decision.escalations, // the dispatcher relays these to the human with the recommendation
  journal: decision.journal,
  report: decision.report,
  uncovered,
  // The gate the dispatcher reads before it treats the pass as sound. A dead verifier means a
  // load-bearing claim was decided on evidence that never arrived; the next pass must re-verify it.
  complete,
}
