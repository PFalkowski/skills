// Tests for manager.js (subagent mode) — run: node tests/workflows/manager.test.js
//
// What this guards, in order of how expensive the failure is:
//   1. THE MANAGER IS NEVER THE AUTHOR. The whole point of this script is that the decision is
//      made by a fresh context that did not write the work. If the ledger or decide agent is not
//      actually dispatched — or is handed the author's context — the independence is gone.
//   2. SILENCE IS NOT A PASS. A dead ledger, a dead verifier, a dead decider each produce a
//      plausible-looking result. `complete` must separate them from a clean pass, and a dead
//      verifier must reach the decision as false, never as an unmentioned gap.
//   3. THE WALL (#46). The decide agent cannot spawn a reviewer or a lifecycle. Independence is
//      only real if every such follow-up comes back as a DISPATCH the calling session runs, so the
//      assertion is on what is returned, which a prompt-level test cannot see.
// Convention as grill.test.js / housekeeping-audit.test.js: when you change the script, add the
// assertion, then BREAK YOUR FIX ON PURPOSE and watch it fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '../../workflows', 'manager.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function runManager ({ args, agentFn, budget = {} }) {
  const logs = [], dispatched = []
  const wrapped = async (prompt, opts) => { dispatched.push({ prompt, opts }); return agentFn(prompt, opts) }
  const fn = new Function('args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const s of stages) v = await s(v, item, i)
    return v
  }))
  const out = await fn(args, budget, wrapped, parallel, pipeline, () => {}, m => logs.push(m))
  return { ...out, logs, dispatched }
}

const LEDGER = {
  mandate: 'restore retry coverage on every store path; done = green and independently grilled',
  items: [
    { id: 'A1', kind: 'claim', text: 'tests pass', loadBearing: true, verifyHow: 'gh pr checks' },
    { id: 'A2', kind: 'ask', text: 'PR ready = review/merge', loadBearing: true },
    { id: 'A3', kind: 'open-item', text: 'F5 parity', loadBearing: false },
  ],
  verifications: [{ id: 'V1', claim: 'the breaker test uses production defaults',
    brief: 'read the test and flip the threshold', command: 'grep -n breaker test/' }],
  notes: 'checks green on the head sha',
}
const DECISION = {
  verdicts: [
    { id: 'A2', verdict: 'REDIRECT', reason: 'no independent review yet', evidence: 'no review on the head' },
    { id: 'A3', verdict: 'DEFER', reason: 'wanted, not now', evidence: 'ticket #531' },
  ],
  dispatches: [
    { id: 'D1', skill: 'code-review-grill', why: 'no independent review', brief: 'grill PR #515', kind: 'agent' },
    { id: 'D2', skill: 'sdlc-old-fashioned', why: 'load-bearing change', brief: 'run the lifecycle', kind: 'workflow' },
  ],
  escalations: [{ ask: 'merge PR #515?', evidence: 'green, grilled', recommendation: 'merge', hardLine: 'merge=ask' }],
  journal: ['[11-27 12:00] PR #515 A2 REDIRECT no independent review — told session'],
  report: 'Managed: PR #515. Verdicts: 0 approved, 1 redirected, 1 deferred, 0 vetoed. Escalated: merge.',
}

const baseArgs = o => ({ mandate: { goal: 'restore retry coverage' }, subject: 'PR #515',
  outputs: ['PR #515 — ready, no human review yet. 1224/1224 tests pass.'],
  repo: '/r', local: false, tiers: { manager: 'opus', verify: 'opus' }, ...o })

const mkAgent = ({ ledger = LEDGER, decision = DECISION,
  verify = { holds: true, why: 'holds', evidence: 'test asserts prod defaults', method: 'ran it' },
  ledgerDies = false, decideDies = false, verifierDies = false, verifierThrows = false } = {}) =>
  async (prompt, opts) => {
    if (opts.label === 'ledger') return ledgerDies ? null : ledger
    if (opts.label.startsWith('verify:')) {
      if (verifierThrows) throw new Error('boom')
      return verifierDies ? null : verify
    }
    if (opts.label === 'decide') return decideDies ? null : decision
    throw new Error('unexpected label ' + opts.label)
  }

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('the manager is never the author — every decision is a fresh dispatch:')
{
  const r = await runManager({ args: baseArgs(), agentFn: mkAgent() })
  await t('a ledger agent is dispatched first', () => r.dispatched[0].opts.label === 'ledger')
  await t('...and a SEPARATE decide agent decides — the ledger agent does not decide',
    () => r.dispatched.filter(d => d.opts.label === 'decide').length === 1)
  await t('the ledger prompt says the manager did not write the work',
    () => /did NOT write the work/.test(r.dispatched[0].prompt))
  await t('the decide prompt says the manager did not write the work',
    () => r.dispatched.filter(d => d.opts.label === 'decide')
      .every(d => /did NOT write the work/.test(d.prompt)))
  await t('every prompt forbids spawning (the failure is silent, so it must be said)',
    () => r.dispatched.every(d => /no Agent, Task or Workflow tool/i.test(d.prompt)))
  await t('the decide agent is told a fresh reviewer is a dispatch, never something it does itself',
    () => r.dispatched.filter(d => d.opts.label === 'decide')
      .every(d => /needs a fresh\s+reviewer is ALWAYS a dispatch/.test(d.prompt)))
}

console.log('')
console.log('verification is the SCRIPT\'s fan-out, fresh and self-contained:')
{
  const r = await runManager({ args: baseArgs(), agentFn: mkAgent() })
  const verifies = r.dispatched.filter(d => d.opts.label.startsWith('verify:'))
  await t('one fact-check agent per load-bearing verification', () => verifies.length === 1)
  await t('the verifier is fresh: it does not receive the pasted report',
    () => verifies.every(d => !d.prompt.includes('--- output 1 ---')))
  await t('...but it does receive the claim, the brief and the settling command',
    () => verifies.every(d => d.prompt.includes('production defaults') &&
      d.prompt.includes('flip the threshold') && d.prompt.includes('grep -n breaker')))
  await t('the verifier runs isolated in a worktree',
    () => verifies.every(d => d.opts.isolation === 'worktree'))
  await t('the decide agent receives the verification result',
    () => r.dispatched.filter(d => d.opts.label === 'decide')
      .every(d => /test asserts prod defaults/.test(d.prompt)))
}

console.log('')
console.log('silence is never a pass:')
{
  const dead = await runManager({ args: baseArgs(), agentFn: mkAgent({ ledgerDies: true }) })
  await t('a dead ledger stops the run — no decide is dispatched against nothing',
    () => dead.complete === false && dead.dispatched.filter(d => d.opts.label === 'decide').length === 0)
  await t('...and the uncovered reason says the manager could not run',
    () => /ledger agent died/.test(dead.uncovered[0]))

  const vd = await runManager({ args: baseArgs(), agentFn: mkAgent({ verifierDies: true }) })
  await t('a dead verifier is uncovered — the claim is not silently accepted',
    () => vd.complete === false && vd.uncovered.some(u => /verifier died/.test(u)))
  await t('...and the decision still runs, told the claim is unverified and false',
    () => vd.dispatched.filter(d => d.opts.label === 'decide').length === 1 &&
      /unverified/.test(vd.dispatched.filter(d => d.opts.label === 'decide')[0].prompt))

  const vt = await runManager({ args: baseArgs(), agentFn: mkAgent({ verifierThrows: true }) })
  await t('a verifier that throws is uncovered too — a throw is not a pass',
    () => vt.complete === false && vt.uncovered.some(u => /verifier threw/.test(u)))

  const dd = await runManager({ args: baseArgs(), agentFn: mkAgent({ decideDies: true }) })
  await t('a dead decider is incomplete, and the ledger is still handed back',
    () => dd.complete === false && dd.ledger.length === LEDGER.items.length &&
      dd.uncovered.some(u => /decide agent died/.test(u)))

  const clean = await runManager({ args: baseArgs(), agentFn: mkAgent() })
  await t('a fully verified, decided pass IS complete', () => clean.complete === true && clean.uncovered.length === 0)
}

console.log('')
console.log('the wall — follow-ups come back for the session, they are not run in-script:')
{
  const r = await runManager({ args: baseArgs(), agentFn: mkAgent() })
  await t('the manager\'s dispatches are returned, not executed by the script',
    () => r.dispatches.length === 2 && r.dispatched.every(d => !/^dispatch:/.test(d.opts.label)))
  await t('an agent-kind follow-up is marked for a subagent',
    () => r.dispatches.find(d => d.id === 'D1').kind === 'agent')
  await t('a workflow-kind follow-up is marked for the session to start a Workflow',
    () => r.dispatches.find(d => d.id === 'D2').kind === 'workflow')
  await t('escalations and the human report are returned for the dispatcher to relay',
    () => r.escalations.length === 1 && /Managed: PR #515/.test(r.report))
  await t('the journal is returned as one line per decision',
    () => r.journal.length === 1 && /REDIRECT/.test(r.journal[0]))
}

console.log('')
console.log('inputs are required — a manager without a goal or an output has nothing to manage:')
{
  const noGoal = await runManager({ args: baseArgs({ mandate: {} }), agentFn: mkAgent() }).then(() => false, e => /mandate\.goal is required/.test(e.message))
  await t('no mandate.goal throws', () => noGoal === true)
  const noOut = await runManager({ args: baseArgs({ outputs: [] }), agentFn: mkAgent() }).then(() => false, e => /args\.outputs is required/.test(e.message))
  await t('no outputs throws', () => noOut === true)
}

console.log('')
console.log('stamped output — every line says which run it belongs to:')
{
  const r = await runManager({ args: baseArgs({ startedAt: '11-27 12:00' }), agentFn: mkAgent() })
  await t('every logged line carries the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[11-27 12:00] ')))
  const r2 = await runManager({ args: baseArgs(), agentFn: mkAgent() })
  await t('with no stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
