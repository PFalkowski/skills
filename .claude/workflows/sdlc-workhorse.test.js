// Tests for sdlc-workhorse.js — run: node .claude/workflows/sdlc-workhorse.test.js
//
// WHY THIS EXISTS.
//
// The review stage carries a rule the script cannot enforce by reading well: a QUORUM MUST BE
// CONVENED BY THE SCRIPT. An agent() dispatched inside a Workflow holds no Agent/Task tool, so
// telling one reviewer "you are a quorum reviewer, concerns: a, b, c" does not produce a quorum —
// it produces one agent role-playing three, and the independence that is the entire reason to pay
// for a quorum is gone silently. Nothing throws. The report still says the concerns were reviewed.
//
// That is the same shape as every serious bug hunt.js has had, and the same shape as the
// nights-watch grill defect (PFalkowski/skills#46, where 9 rangers hit it across 3 patrols): a
// CORRECT RULE, DEFEATED AT THE SEAM WHERE IT'S INVOKED. It is invisible to a unit test of the
// review prompt, because such a test asks the prompt what it says rather than asking the script
// how many reviewers it actually dispatched.
//
// So these tests run the REAL script with stubbed agent/parallel/pipeline and assert on WHAT IT
// DISPATCHED and WHAT IT RETURNED. When you change the review stage: add the assertion, then
// BREAK YOUR FIX ON PURPOSE and watch it fail. A test that has never failed is a decoration.
//
// The stubs mirror the documented Workflow contract, which is the authority here:
//   - parallel(thunks) resolves a throwing thunk to null and NEVER rejects
//   - pipeline(items, ...stages) passes (prevResult, originalItem, index) to each stage
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'sdlc-workhorse.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function runWorkhorse ({ args, agentFn, budget }) {
  const logs = []
  const calls = []                       // every agent() the script dispatched, in order
  const fn = new Function('args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const s of stages) v = await s(v, item, i)
    return v
  }))
  const spy = async (prompt, opts) => { calls.push({ prompt, opts }); return agentFn(prompt, opts) }
  const out = await fn(args, budget || { total: null, spent: () => 0, remaining: () => Infinity },
    spy, parallel, pipeline, () => {}, m => logs.push(m))
  return { ...out, logs, calls }
}

// A stub that carries every phase to the review stage and stops fighting us there.
// `reviews` maps a concern name (or '_single') to the findings that reviewer returns.
const mkAgent = ({ reviews = {}, reviewDies = [] } = {}) => async (prompt, opts) => {
  const L = opts.label
  if (L === 'baseline') return { green: true, pitfalls: [], missingGuardrails: [],
    checks: [{ command: 'npm test', passed: true, output: 'ok' }] }
  if (L === 'spec') return { problem: 'p', goal: 'g', scope: ['s'], nonGoals: ['n'], successCriteria: ['c'] }
  if (L.startsWith('claims:')) return { claims: [] }        // no claims → no refute rounds on artifacts
  if (L.startsWith('grill:')) return { holes: [], verdict: 'sharp' }
  if (L.startsWith('plan:')) return { approach: 'a', components: ['c'], failureModes: ['f'],
    alternativesRejected: [{ alternative: 'x', whyRejected: 'y' }], testStrategy: 't' }
  if (L.startsWith('plan-review:')) return { verdict: 'approved', findings: [] }
  if (L === 'slice') return { slices: [{ id: 's1', title: 'S1', acceptanceCriterion: 'AC', tier: 'haiku' }] }
  if (L.startsWith('red-check:')) return { status: 'confirmed', evidence: 'failed on the assertion' }
  if (L.startsWith('red:')) return { testPath: 't.js', testCommand: 'npm test', output: 'FAIL', failedForTheRightReason: true }
  if (L.startsWith('green:')) return { passed: true, output: 'PASS', summary: 'done' }
  if (L.startsWith('review:')) {
    const concern = L.split(':')[2] || '_single'
    if (reviewDies.includes(concern)) return null
    return { findings: reviews[concern] || [] }
  }
  if (L.startsWith('refute:')) return { status: 'confirmed', evidence: 'reproduced it' }
  if (L === 'document') return { docsChanged: ['README.md'], adrsWritten: [], baselineStillGreen: true, baselineOutput: 'ok' }
  if (L === 'retro') return { lessons: [], reflection: 'r' }
  throw new Error(`unstubbed agent label: ${L}`)
}

const finding = o => ({ summary: 'off-by-one in loop', failureScenario: 'n=0 → crash', severity: 'minor', file: 'a.js', ...o })
const baseArgs = o => ({ goal: 'build the thing', chronicleDir: '/c', ...o })
const reviewCalls = r => r.calls.filter(c => c.opts.label.startsWith('review:'))
const findingsOf = r => r.slices.flatMap(s => s.verifiedFindings)

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('single stance (the default) — exactly one reviewer, unlensed:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent({ reviews: { _single: [finding()] } }) })
  await t('dispatches exactly one review agent', () => reviewCalls(r).length === 1)
  await t('...labelled without a concern suffix', () => reviewCalls(r)[0].opts.label === 'review:s1')
  await t('...and its finding reaches the report', () => findingsOf(r).length === 1)
}

console.log('\nquorum — THE SEAM: the script convenes it, one agent per concern:')
{
  const concerns = ['security', 'architecture', 'tests']
  const r = await runWorkhorse({
    args: baseArgs({ reviewStance: 'quorum', reviewConcerns: concerns }),
    agentFn: mkAgent({ reviews: {
      security: [finding({ summary: 'secret in log', file: 'a.js' })],
      architecture: [finding({ summary: 'layering violation', file: 'b.js' })],
      tests: [finding({ summary: 'no regression test', file: 'c.js' })],
    } }) })
  // If a single agent were told "you are a quorum", this would be 1. That is the bug.
  await t('dispatches ONE review agent PER CONCERN, not one agent told to be several',
    () => reviewCalls(r).length === concerns.length)
  await t('...each labelled with its own concern', () =>
    concerns.every(c => reviewCalls(r).some(x => x.opts.label === `review:s1:${c}`)))
  await t('...each reviewer is given exactly one lens', () =>
    reviewCalls(r).every(x => (x.prompt.match(/YOUR LENS:/g) || []).length === 1))
  await t('...and no reviewer is handed the whole concern list (that is what collapsed them)',
    () => !reviewCalls(r).some(x => concerns.every(c => x.prompt.includes(c))))
  await t('findings from EVERY concern reach the report', () => findingsOf(r).length === 3)
}

console.log('\nno reviewer is ever told to convene a quorum itself (the #46 regression guard):')
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent({ reviews: {} }) })
  await t('every reviewer is told it is the SINGLE reviewer for its task',
    () => reviewCalls(r).every(x => /you ARE the single adversarial reviewer/.test(x.prompt)))
  await t('...and explicitly told not to spawn, since it has no tool to do it with',
    () => reviewCalls(r).every(x => /do NOT try to convene a quorum or spawn reviewer subagents/i.test(x.prompt)))
  await t('...and told the script already fanned the quorum out',
    () => reviewCalls(r).every(x => /already fanned out by the script/i.test(x.prompt)))
}

console.log('\ndedupe — overlapping lenses must not be paid for twice:')
{
  const dup = finding({ summary: 'Off-by-one in LOOP', file: 'a.js' })
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent({ reviews: { security: [finding()], tests: [dup] } }) })
  await t('the same defect found by two lenses collapses to one finding', () => findingsOf(r).length === 1)
  await t('...and only the surviving one is verified (no wasted refute round)',
    () => r.calls.filter(c => c.opts.label.startsWith('refute:')).length === 3)  // 3 lenses × 1 finding
}
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent({ reviews: { security: [finding({ file: 'a.js' })], tests: [finding({ file: 'b.js' })] } }) })
  await t('the same summary in a DIFFERENT file is not a duplicate', () => findingsOf(r).length === 2)
}

console.log('\na dead reviewer must not take the quorum down with it:')
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'architecture'] }),
    agentFn: mkAgent({ reviews: { architecture: [finding()] }, reviewDies: ['security'] }) })
  await t('the surviving lens still reports (parallel resolves a dead thunk to null)',
    () => findingsOf(r).length === 1)
  await t('...and the run does not throw', () => typeof r.mergeReady === 'boolean')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
