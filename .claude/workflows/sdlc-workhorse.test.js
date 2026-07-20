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

// ---------------------------------------------------------------------------
// THE PREMISE FLOOR — the same shape of seam as the quorum above. "opus for
// design" was a DEFAULT in an Object.assign, so a caller passing
// cfg.tiers: {grill: 'haiku'} bought an unexamined premise at full price and
// nothing said so. The rule read fine; it was defeated where it was applied.
// These assert on the model the script ACTUALLY dispatched, not on the table.
// ---------------------------------------------------------------------------
const tierOf = (r, pred) => r.calls.filter(c => pred(c.opts.label)).map(c => c.opts.model)
const PREMISE = l => l === 'spec' || l.startsWith('grill:') || l.startsWith('plan:') || l.startsWith('plan-review:')

console.log('\nthe premise gates are FLOORED at opus, not merely defaulted to it:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent() })
  await t('spec/grill/plan/plan-review all dispatch at opus by default',
    () => tierOf(r, PREMISE).length === 4 && tierOf(r, PREMISE).every(m => m === 'opus'))
}
{
  // THE SEAM: a caller trying to buy a cheap premise. Object.assign alone honours this.
  const r = await runWorkhorse({
    args: baseArgs({ tiers: { spec: 'haiku', grill: 'haiku', plan: 'haiku', planReview: 'sonnet' } }),
    agentFn: mkAgent() })
  await t('cfg.tiers CANNOT lower a premise phase below opus',
    () => tierOf(r, PREMISE).every(m => m === 'opus'))
  await t('...and the substitution is logged, never silent',
    () => r.logs.some(m => /floor/i.test(m) && /opus/.test(m)))
  await t('...while a NON-premise phase is still freely tunable',
    () => { const d = tierOf(r, l => l === 'document'); return d.length === 1 && d[0] === 'sonnet' })
}
{
  const r = await runWorkhorse({ args: baseArgs({ tiers: { plan: 'gpt-cheap' } }), agentFn: mkAgent() })
  await t('an UNRECOGNISED tier name is clamped too (unknown is not evidence of capable)',
    () => tierOf(r, l => l.startsWith('plan:')).every(m => m === 'opus'))
}

// ---------------------------------------------------------------------------
// ONLY PROVEN CLAIMS ARE HELD. The old gate returned just the refuted claims,
// so the survivors were discarded with the failures and the next phase re-read
// the raw artifact — inheriting every assertion, including unexamined ones.
// ---------------------------------------------------------------------------
const mkClaimAgent = ({ claims, verdicts }) => {
  const base = mkAgent()
  return async (prompt, opts) => {
    const L = opts.label
    if (L.startsWith('claims:')) return { claims: claims.map(c => ({ claim: c, whyLoadBearing: 'load-bearing' })) }
    if (L.startsWith('refute:')) {
      const hit = claims.find(c => prompt.includes(c))
      return { status: verdicts[hit] || 'confirmed', evidence: `verdict for ${hit}` }
    }
    return base(prompt, opts)
  }
}
const promptFor = (r, label) => (r.calls.find(c => c.opts.label === label) || {}).prompt || ''

console.log('\nthe premise is fact-checked and only the survivors are carried forward:')
{
  const r = await runWorkhorse({
    args: baseArgs(),
    agentFn: mkClaimAgent({
      claims: ['the API returns 404 on missing', 'the cache is write-through'],
      verdicts: { 'the cache is write-through': 'refuted' } }) })
  const planPrompt = promptFor(r, 'plan:r1')
  const premiseSection = planPrompt.slice(planPrompt.indexOf('VERIFIED PREMISE'), planPrompt.indexOf('<spec>'))
  await t('a PROVEN claim is handed to the next phase as verified premise',
    () => premiseSection.includes('the API returns 404 on missing'))
  await t('a REFUTED claim is NOT carried forward as established',
    () => !premiseSection.includes('the cache is write-through'))
  await t('...and its rejection is reported, not swallowed',
    () => r.logs.some(m => /did not survive refutation/.test(m) && /write-through/.test(m)))
}
{
  // The spec and the requirements grill are premise gates too — previously only
  // the plan's claims were ever refuted, so the definition of "correct" that
  // becomes the RED tests reached the build unexamined.
  const r = await runWorkhorse({
    args: baseArgs(), agentFn: mkClaimAgent({ claims: ['x is true'], verdicts: {} }) })
  const extracted = r.calls.filter(c => c.opts.label.startsWith('claims:')).map(c => c.opts.label)
  await t('the SPEC is adjudicated, not just the plan', () => extracted.includes('claims:spec'))
  await t('the SHARPENED SPEC (which becomes the acceptance criteria) is adjudicated too',
    () => extracted.includes('claims:sharpened spec'))
}
{
  const r = await runWorkhorse({
    args: baseArgs(),
    agentFn: mkClaimAgent({ claims: ['everything is fine'], verdicts: { 'everything is fine': 'refuted' } }) })
  await t('when NOTHING survives, the next phase is told so explicitly',
    () => /VERIFIED PREMISE: none/.test(promptFor(r, 'plan:r1')))
}

console.log('\nmandatory fact-check reaches the premise agents themselves, not just the refuters:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent() })
  const grounded = l => /MANDATORY/.test(promptFor(r, l)) && /fact-check/.test(promptFor(r, l))
    && /UNPROVABLE = FALSE/.test(promptFor(r, l))
  await t('the spec agent is required to ground its claims before writing them', () => grounded('spec'))
  await t('the grill agent is too', () => grounded('grill:r1'))
  await t('the plan agent is too', () => grounded('plan:r1'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
