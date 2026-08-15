// Tests for housekeeping-sweep.js — run: node .claude/workflows/housekeeping-sweep.test.js
//
// The defects worth guarding here:
//   1. A CONCERN THAT WAS NEVER EXAMINED READING AS CLEAN. A lens dropped by the budget bound, a
//      dead surveyor, a dead verifier — all three produce no candidates, which is what a healthy
//      codebase produces. They must be NAMED in `uncovered`, because "we looked at security and
//      found nothing" and "nobody looked at security" are the same output otherwise.
//   2. THE WALL (#46): one first-order agent per lens. An agent told "cover these nine concerns"
//      covers two and reports the set as complete, and nothing throws.
//   3. THE PLANNER DROPPING A CANDIDATE. It is the last stage before a human reads the result, so a
//      candidate it forgets to group vanishes silently between the survey and the decision.
// Convention as grill.test.js: add the assertion, then break your fix on purpose and watch it fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'housekeeping-sweep.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function run ({ args, agentFn, budget = {} }) {
  const logs = [], dispatched = []
  const wrapped = async (prompt, opts) => { dispatched.push({ prompt, opts }); return agentFn(prompt, opts) }
  const fn = new Function('args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const s of stages) { try { v = await s(v, item, i) } catch { return null } }
    return v
  }))
  const out = await fn(args, budget, wrapped, parallel, pipeline, () => {}, m => logs.push(m))
  return { ...out, logs, dispatched }
}

const C = o => ({ title: 'invoice total rounds twice', where: 'src/billing/Invoice.cs:88',
  problem: 'rounds in two places', cost: 'off-by-a-cent on 3% of invoices', fix: 'round once at the boundary',
  effort: 'M', severity: 'high', evidence: 'Invoice.cs:88', ...o })
const baseArgs = o => ({ lenses: ['bugs'], chronicleDir: '/c', ...o })

const mkAgent = ({ candidates = [C()], verdict = { refuted: false, why: 'holds', proof: 'p' },
                   plan = null, rulesDie = false, lensDies = false, verifierDies = false,
                   plannerDies = false } = {}) =>
  async (prompt, opts) => {
    if (opts.label === 'house-rules') return rulesDie ? null : 'RULES: ports and adapters'
    if (opts.label.startsWith('lens:')) return lensDies ? null : { candidates }
    if (opts.label.startsWith('verify:')) return verifierDies ? null : verdict
    if (opts.label === 'plan') {
      if (plannerDies) return null
      if (plan) return plan
      const ids = [...prompt.matchAll(/"id": "(S\d+)"/g)].map(m => m[1])
      return { items: [{ title: 'fix rounding', covers: ids, why: 'money', effort: 'M', risk: 'low',
                         recommendation: 'now', dependsOn: [] }] }
    }
    throw new Error('unexpected label ' + opts.label)
  }

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('the wall — one first-order agent PER LENS, each blind to the others:')
{
  const r = await run({ args: baseArgs({ lenses: ['warnings', 'bugs', 'architecture-drift'] }),
    agentFn: mkAgent({ candidates: [] }) })
  const lenses = r.dispatched.filter(d => d.opts.label.startsWith('lens:'))
  await t('three lenses → three surveyors, not one agent told to cover three', () => lenses.length === 3)
  await t('each surveyor is scoped to a single lens and told the others are covered',
    () => lenses.every(d => /YOUR LENS:/.test(d.prompt) && /other surveyors hold the other/.test(d.prompt)))
  await t('every prompt forbids spawning', () => r.dispatched.every(d => /no Agent, Task or Workflow tool/i.test(d.prompt)))
  await t('every prompt forbids fixing, filing and committing — this script only surveys',
    () => r.dispatched.filter(d => d.opts.label.startsWith('lens:'))
      .every(d => /SURVEYING, not fixing/.test(d.prompt) && /open no issue or PR/.test(d.prompt)))
  await t('an unknown lens name is dropped rather than dispatched as an empty brief',
    async () => (await run({ args: baseArgs({ lenses: ['bugs', 'astrology'] }), agentFn: mkAgent({ candidates: [] }) }))
      .lensesRun.join() === 'bugs')
  await t('no lenses given → the full catalogue runs',
    async () => (await run({ args: baseArgs({ lenses: null }), agentFn: mkAgent({ candidates: [] }) })).lensesRun.length === 9)
}

console.log('')
console.log('an unexamined concern is NAMED — it must never read like a clean one:')
{
  const capped = await run({ args: baseArgs({ lenses: ['warnings', 'bugs', 'smells'], maxLenses: 1 }),
    agentFn: mkAgent({ candidates: [] }) })
  await t('maxLenses bounds the fan-out', () => capped.lensesRun.length === 1)
  await t('...and every dropped lens is named in uncovered, not silently absent',
    () => capped.uncovered.filter(u => /not run/.test(u)).length === 2 &&
          capped.uncovered.some(u => /'smells'/.test(u)) && capped.complete === false)

  const poor = await run({ args: baseArgs({ lenses: ['warnings', 'bugs', 'smells'] }),
    agentFn: mkAgent({ candidates: [] }), budget: { total: 1000, remaining: () => 50000, spent: () => 0 } })
  await t('a thin budget bounds the lenses too, and says budget was the reason',
    () => poor.lensesRun.length < 3 && poor.uncovered.some(u => /budget bound/.test(u)))

  const dead = await run({ args: baseArgs(), agentFn: mkAgent({ lensDies: true }) })
  await t('a dead surveyor → the concern is unexamined, and the run is not complete',
    () => dead.candidates.length === 0 && dead.complete === false && dead.uncovered.some(u => /unexamined/.test(u)))

  const vd = await run({ args: baseArgs(), agentFn: mkAgent({ verifierDies: true }) })
  await t('a dead verifier leaves the candidate unjudged — dropped, but recorded',
    () => vd.candidates.length === 0 && vd.complete === false && vd.uncovered.some(u => /unjudged/.test(u)))

  const clean = await run({ args: baseArgs(), agentFn: mkAgent({ candidates: [] }) })
  await t('a genuinely clean lens IS complete', () => clean.candidates.length === 0 && clean.complete === true)
}

console.log('')
console.log('verification is the floor — taste dies here:')
{
  const killed = await run({ args: baseArgs(),
    agentFn: mkAgent({ verdict: { refuted: true, why: 'the second rounding is on a display copy' } }) })
  await t('a refuted candidate is dropped', () => killed.candidates.length === 0)
  await t('...and recorded with its reason', () => killed.refuted.length === 1 && /display copy/.test(killed.refuted[0]))
  await t('...and no planner is paid for an empty set',
    () => killed.dispatched.filter(d => d.opts.label === 'plan').length === 0 && killed.complete === true)

  const corrected = await run({ args: baseArgs(),
    agentFn: mkAgent({ verdict: { refuted: false, why: 'real', severity: 'critical', effort: 'L', proof: 'repro' } }) })
  await t('the verifier may correct severity and effort — an L reported as S eats a week',
    () => corrected.candidates[0].severity === 'critical' && corrected.candidates[0].effort === 'L')

  const sorted = await run({ args: baseArgs({ lenses: ['bugs'] }),
    agentFn: mkAgent({ candidates: [C({ title: 'a', severity: 'nit' }), C({ title: 'b', where: 'x.cs:1', severity: 'critical' })] }) })
  await t('candidates sort worst-first and carry stable ids',
    () => sorted.candidates[0].severity === 'critical' && sorted.candidates.map(c => c.id).join() === 'S1,S2')

  const dup = await run({ args: baseArgs({ lenses: ['bugs', 'smells'] }), agentFn: mkAgent() })
  await t('one problem found by two lenses is returned once', () => dup.candidates.length === 1)
  await t('...but both were verified — dedup is after verification',
    () => dup.dispatched.filter(d => d.opts.label.startsWith('verify:')).length === 2)
}

console.log('')
console.log('the planner groups by cause — and may not lose a candidate on the way:')
{
  const ok = await run({ args: baseArgs(), agentFn: mkAgent() })
  await t('verified candidates are grouped into work items with a recommendation',
    () => ok.plan.length === 1 && ok.plan[0].recommendation === 'now' && ok.complete === true)

  const lost = await run({ args: baseArgs({ lenses: ['bugs', 'smells'] }),
    agentFn: mkAgent({ candidates: [C(), C({ title: 'dead code', where: 'src/Old.cs:1' })],
      plan: { items: [{ title: 'fix rounding', covers: ['S1'], why: 'money', effort: 'M', risk: 'low', recommendation: 'now' }] } }) })
  await t('a candidate the planner omitted is named in uncovered, not silently dropped',
    () => lost.uncovered.some(u => /omitted 1 candidate/.test(u)) && lost.complete === false)
  await t('...and it is still returned in candidates for the human to see',
    () => lost.candidates.length === 2)

  const pd = await run({ args: baseArgs(), agentFn: mkAgent({ plannerDies: true }) })
  await t('a dead planner still returns the candidates, ungrouped, and says so',
    () => pd.candidates.length === 1 && pd.plan.length === 0 && pd.uncovered.some(u => /ungrouped/.test(u)))
}

console.log('')
console.log('house rules — distilled once, and degraded is disclosed:')
{
  const ok = await run({ args: baseArgs({ intendedArchitecture: 'ports and adapters' }), agentFn: mkAgent({ candidates: [] }) })
  await t('the rules are distilled by ONE agent and handed to every lens',
    () => ok.dispatched.filter(d => d.opts.label === 'house-rules').length === 1 &&
          ok.dispatched.filter(d => d.opts.label.startsWith('lens:')).every(d => d.prompt.includes('RULES: ports and adapters')))
  const rulesPrompt = async docsAreTrue => (await run({ args: baseArgs({ docsAreTrue }), agentFn: mkAgent({ candidates: [] }) }))
    .dispatched.find(d => d.opts.label === 'house-rules').prompt
  await t('docsAreTrue=false warns the rules agent the docs are unverified',
    async () => /CAUTION/.test(await rulesPrompt(false)))
  await t('docsAreTrue=true tells it the docs were just audited',
    async () => /just went through a documentation audit/.test(await rulesPrompt(true)))

  const dead = await run({ args: baseArgs(), agentFn: mkAgent({ candidates: [], rulesDie: true }) })
  await t('a dead rules agent → each lens is told to read the docs itself',
    () => dead.dispatched.filter(d => d.opts.label.startsWith('lens:'))
      .every(d => /Read the repo's own docs/.test(d.prompt)))
}

console.log('')
console.log('isolation is opt-in — N worktrees means N restores of the build:')
{
  const off = await run({ args: baseArgs(), agentFn: mkAgent() })
  await t('by default lenses run in the current tree', () => off.dispatched.every(d => !d.opts.isolation))
  const on = await run({ args: baseArgs({ isolate: true }), agentFn: mkAgent() })
  await t('isolate:true puts surveyors and verifiers in worktrees',
    () => on.dispatched.filter(d => /^(lens|verify):/.test(d.opts.label)).every(d => d.opts.isolation === 'worktree'))
}

console.log('')
console.log('stamped output:')
{
  const r = await run({ args: baseArgs({ startedAt: '08-15 21:04' }), agentFn: mkAgent() })
  await t('every logged line carries the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[08-15 21:04] ')))
  const r2 = await run({ args: baseArgs(), agentFn: mkAgent() })
  await t('with no stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
