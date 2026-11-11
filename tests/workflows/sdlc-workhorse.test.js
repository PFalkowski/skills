// Tests for sdlc-workhorse.js — run: node tests/workflows/sdlc-workhorse.test.js
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
//   - pipeline(items, ...stages) passes (prevResult, originalItem, index) to each stage, and a
//     stage that throws drops that item to null
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '../../workflows', 'sdlc-workhorse.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function runWorkhorse ({ args, agentFn, budget }) {
  const logs = []
  const calls = []                       // every agent() the script dispatched, in order
  const fn = new Function('args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    try {
      let v = item
      for (const s of stages) v = await s(v, item, i)
      return v
    } catch { return null }
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
  if (L.startsWith('plan:')) return { approach: 'a', components: ['c'], failureModes: [{ failure: 'f', blockedBy: 'b' }],
    alternativesRejected: [{ alternative: 'x', whyRejected: 'y' }], testStrategy: 't' }
  if (L.startsWith('plan-review:')) return { verdict: 'approved', findings: [] }
  if (L === 'slice') return { slices: [{ id: 's1', title: 'S1', acceptanceCriterion: 'AC', effort: 'low' }] }
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
const promptFor = (r, label) => (r.calls.find(c => c.opts.label === label) || {}).prompt || ''

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

console.log('\none working tree (parallel 1) — slices build one after another:')
{
  const base = mkAgent()
  const twoSlices = async (prompt, opts) => opts.label === 'slice'
    ? { slices: [{ id: 's1', title: 'S1', acceptanceCriterion: 'AC1', effort: 'low' },
                 { id: 's2', title: 'S2', acceptanceCriterion: 'AC2', effort: 'low' }] }
    : base(prompt, opts)
  const at = (r, label) => r.calls.findIndex(c => c.opts.label === label)
  const serial = await runWorkhorse({ args: baseArgs(), agentFn: twoSlices })
  await t('the second slice starts only after the first is reviewed',
    () => at(serial, 'review:s1') >= 0 && at(serial, 'red:s2') > at(serial, 'review:s1'))
  await t('...and no builder is sent to a separate worktree',
    () => serial.calls.every(c => c.opts.isolation === undefined))
  let dispatched = 0
  let refusal = null
  try {
    await runWorkhorse({ args: baseArgs({ parallel: 2 }), agentFn: async (p, o) => { dispatched++; return twoSlices(p, o) } })
  } catch (e) { refusal = e }
  await t('parallel 2 is refused before any agent runs',
    () => refusal && /parallel > 1 is not supported/.test(refusal.message) && dispatched === 0)
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
    () => reviewCalls(r).length === [...concerns, 'quality-standard'].length)
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

// ---------------------------------------------------------------------------
// THE QUALITY STANDARD IS A GATE, NOT ADVICE. less-is-more and no-comment bind
// every line, so a verified breach blocks merge like a bug. The seam: a reviewer
// labels a stray comment "nit", and a severity-only gate would wave it through.
// ---------------------------------------------------------------------------
const QUALITY = p => /less-is-more/.test(p) && /no-comment/.test(p)

console.log('\nthe quality standard reaches the builder and the reviewer:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent() })
  await t('the GREEN/refactor agent is held to less-is-more and no-comment', () => QUALITY(promptFor(r, 'green:s1')))
  await t('...and the single reviewer grades the diff against both', () => QUALITY(promptFor(r, 'review:s1')))
  const rule = reviewCalls(r)[0].opts.schema.properties.findings.items.properties.rule
  await t('a review finding can name the rule it breaks',
    () => !!rule && ['behaviour', 'less-is-more', 'no-comment'].every(v => rule.enum.includes(v)))
}

console.log('\nunder quorum, exactly one reviewer carries the quality lens:')
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent() })
  await t('the script appends it when the caller did not list it',
    () => reviewCalls(r).length === 3 && reviewCalls(r).some(c => c.opts.label === 'review:s1:quality-standard'))
  await t('...only that reviewer carries the rule', () =>
    reviewCalls(r).filter(c => QUALITY(c.prompt)).map(c => c.opts.label).join() === 'review:s1:quality-standard')
  await t('...and the addition is logged, never silent', () => r.logs.some(m => /quality-standard/.test(m)))
}
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['correctness', 'quality-standard'] }),
    agentFn: mkAgent() })
  await t('a caller who listed it gets it once, not twice', () => reviewCalls(r).length === 2)
  await t('...and nothing is logged as appended', () => !r.logs.some(m => /appended/.test(m)))
}

console.log('\na verified quality finding blocks merge whatever its severity:')
const nitOn = (rule, refute = 'confirmed') => {
  const base = mkAgent({ reviews: { _single: [finding({ severity: 'nit', ...(rule && { rule }) })] } })
  return async (prompt, opts) => opts.label.startsWith('refute:') && opts.phase === 'Review'
    ? { status: refute, evidence: 'checked the diff' } : base(prompt, opts)
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: nitOn('no-comment') })
  await t('a verified no-comment nit makes the run not merge-ready', () => r.mergeReady === false)
  await t('...and says why in mergeBlockedBy', () => r.mergeBlockedBy.some(m => /no-comment/.test(m)))
  await t('...and the report carries the rule', () => findingsOf(r)[0].rule === 'no-comment')
  await t('...and the refuters are told which rule they are attacking',
    () => r.calls.filter(c => c.opts.label.startsWith('refute:') && c.opts.phase === 'Review')
      .every(c => /Rule: no-comment/.test(c.prompt)))
  await t('...and what refutes it: outside the diff, a why-comment, a smaller change that breaks the test',
    () => r.calls.filter(c => c.opts.label.startsWith('refute:') && c.opts.phase === 'Review')
      .every(c => /not in this slice's diff/.test(c.prompt) && /why rather than what/.test(c.prompt)
        && /keep the slice's test green/.test(c.prompt)))
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: nitOn(null) })
  await t('a verified behaviour nit does not block', () => r.mergeReady === true)
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: nitOn('no-comment', 'refuted') })
  await t('a refuted quality finding does not block', () => r.mergeReady === true)
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
    args: baseArgs({ tiers: { spec: 'haiku', grill: 'haiku', plan: 'haiku', planReview: 'sonnet', document: 'sonnet' } }),
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
    // Claims default to the largest blast radius so existing cases stay above any cap; pass
    // {claim, blastRadius} to exercise the ranking.
    if (L.startsWith('claims:')) {
      return { claims: claims.map(c => (typeof c === 'string'
        ? { claim: c, whyLoadBearing: 'load-bearing', blastRadius: 'total' }
        : { whyLoadBearing: 'load-bearing', ...c })) }
    }
    if (L.startsWith('refute:')) {
      const hit = claims.map(c => (typeof c === 'string' ? c : c.claim)).find(c => prompt.includes(c))
      return { status: verdicts[hit] || 'confirmed', evidence: `verdict for ${hit}` }
    }
    return base(prompt, opts)
  }
}

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
{
  // proven() folds an all-`unverifiable` vote into `why` as the joined evidence (never empty),
  // rather than the generic "no verifier returned a verdict" placeholder that fires only when a
  // verifier agent dies outright. A claim nobody could run is not the same failure as a claim
  // nobody looked at, and the report must say which one happened.
  const r = await runWorkhorse({
    args: baseArgs(),
    agentFn: mkClaimAgent({ claims: ['the timeout is 30s'], verdicts: { 'the timeout is 30s': 'unverifiable' } }) })
  await t('an all-unverifiable claim is rejected, not silently held',
    () => !promptFor(r, 'plan:r1').includes('the timeout is 30s'))
  await t('...with a non-empty explanation in the log, not the dead-verifier placeholder',
    () => r.logs.some(m => /did not survive refutation/.test(m) && /the timeout is 30s/.test(m)
      && /verdict for the timeout is 30s/.test(m) && !/no verifier returned a verdict/.test(m)))
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

console.log('\ninvert reaches the plan and its review — read by path, since the Skill tool refuses a manual-only skill:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent() })
  const inverts = l => /invert\/SKILL\.md/.test(promptFor(r, l)) && /manual-only/.test(promptFor(r, l))
    && !/Use the "invert" skill/.test(promptFor(r, l))
  await t('the plan agent is told to read invert/SKILL.md', () => inverts('plan:r1'))
  await t('...and so is the plan reviewer', () => inverts('plan-review:r1'))
  await t('...who files a failure the plan does not block as a finding',
    () => /does not already block is a finding/.test(promptFor(r, 'plan-review:r1')))
  const planSchema = r.calls.find(c => c.opts.label === 'plan:r1').opts.schema
  await t('every failure mode must say what blocks it', () =>
    (planSchema.properties.failureModes.items.required || []).includes('blockedBy'))
  await t('...with no parallel inversion field beside it', () => !('inversion' in planSchema.properties))
}

// ---------------------------------------------------------------------------
// THE REFUTER FAN-OUT IS BOUNDED, AND WHAT IT DROPS IS NAMED. Refuters were 93
// of 103 agents on a measured P3 fix. The cap spends the budget on the claims
// with the largest blast radius rather than thinning the lenses, and a claim
// already adjudicated is not re-proved when a later round re-extracts it.
// ---------------------------------------------------------------------------
console.log('\nthe refuter fan-out is bounded without thinning the lenses:')
{
  const r = await runWorkhorse({
    args: { ...baseArgs(), maxClaimsPerGate: 2 },
    agentFn: mkClaimAgent({
      claims: [
        { claim: 'detail that can change freely', blastRadius: 'moderate' },
        { claim: 'the whole design rests on this', blastRadius: 'total' },
        { claim: 'a section would need redesign', blastRadius: 'major' },
      ],
      verdicts: {},
    }),
  })
  const refuted = r.calls.filter(c => (c.opts.label || '').startsWith('refute:'))
  const attacked = s => refuted.some(c => c.prompt.includes(s))

  await t('the largest-blast-radius claim is attacked', () => attacked('the whole design rests on this'))
  await t('...and the next largest, up to the cap', () => attacked('a section would need redesign'))
  await t('the lowest-blast-radius claim is dropped, not the lenses',
    () => !attacked('detail that can change freely'))
  await t('each examined claim still gets all three perspective-diverse lenses', () => {
    const perClaim = refuted.filter(c => c.prompt.includes('the whole design rests on this'))
    return perClaim.length === 3
  })
  await t('what the cap dropped is reported, never silently cut',
    () => (r.logs || []).join('\n').includes('detail that can change freely'))
}

console.log('\na claim proved once is not re-proved when a later gate re-extracts it:')
{
  const shared = 'the same claim both gates lean on'
  const r = await runWorkhorse({
    args: baseArgs(),
    agentFn: mkClaimAgent({ claims: [shared], verdicts: {} }),
  })
  const forShared = r.calls.filter(c => (c.opts.label || '').startsWith('refute:') && c.prompt.includes(shared))
  const gates = r.calls.filter(c => (c.opts.label || '').startsWith('claims:')).length
  await t('it is extracted at more than one gate', () => gates > 1)
  await t('...but refuted only once, by three lenses', () => forShared.length === 3)
}

// ---------------------------------------------------------------------------
// STAMPED OUTPUT. The stamp identifies WHICH RUN a line came from. It is the
// watcher's clock, passed in — the script has none (Date.now() throws here), so
// the failures to guard are a line that silently loses its stamp, and an absent
// stamp rendering as "[undefined]", which reads like a real timestamp.
// ---------------------------------------------------------------------------
// A GATE THAT DID NOT RUN NEVER READS AS A GATE THAT PASSED. agent() returns null when a
// subagent dies, and every `|| []` that turns that null into "no findings" or "no claims"
// opens the gate it was meant to hold. mergeReady is what the dispatchers act on.
// ---------------------------------------------------------------------------
const overriding = (overrides, base = mkAgent()) => async (prompt, opts) => {
  for (const [prefix, fn] of Object.entries(overrides)) {
    if (opts.label.startsWith(prefix)) { const v = await fn(prompt, opts); if (v !== undefined) return v }
  }
  return base(prompt, opts)
}
const nSlices = n => ({ slices: Array.from({ length: n }, (_, i) =>
  ({ id: `s${i + 1}`, title: `S${i + 1}`, acceptanceCriterion: `AC${i + 1}`, effort: 'low' })) })
const blockerFinding = finding({ summary: 'SQL injection in query builder', severity: 'blocker' })

console.log('\na gate that did not run never reads as passed:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent({ reviewDies: ['_single'] }) })
  await t('a dead single reviewer blocks mergeReady', () => r.mergeReady === false)
  await t('...and says why', () => r.mergeBlockedBy.some(b => /review did not run/.test(b)))
}
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent({ reviewDies: ['security', 'tests', 'quality-standard'] }) })
  await t('a quorum whose every lens died blocks mergeReady', () => r.mergeReady === false)
}
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: ['security', 'tests'] }),
    agentFn: mkAgent({ reviewDies: ['security'] }) })
  await t('one dead lens blocks too — that concern was never reviewed',
    () => r.mergeReady === false && r.mergeBlockedBy.some(b => /security/.test(b)))
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ 'refute:': () => null },
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('a blocker whose refuters all died is not dropped: it blocks as unadjudicated',
    () => r.mergeReady === false && r.mergeBlockedBy.some(b => /unadjudicated/.test(b)))
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(
    { 'refute:': () => ({ status: 'unverifiable', evidence: 'no runtime' }) },
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('...and the same when every refuter answers "unverifiable"', () => r.mergeReady === false)
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(
    { 'refute:': () => ({ status: 'refuted', evidence: 'the guard is at a.js:3' }) },
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('a finding actually refuted is dropped and does not block (control)', () => r.mergeReady === true)
}
{
  const split = { 'refute:1': () => ({ status: 'confirmed', evidence: 'repro' }),
    'refute:2': () => ({ status: 'refuted', evidence: 'guarded' }),
    'refute:3': () => ({ status: 'unverifiable', evidence: 'no runtime' }) }
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(split,
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('a blocker with no majority either way (1 confirmed, 1 refuted, 1 unverifiable) blocks as unadjudicated',
    () => r.mergeReady === false && r.mergeBlockedBy.some(b => /unadjudicated/.test(b)))
  const tie = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ ...split, 'refute:3': () => null },
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('...and so does a 1–1 tie where the third refuter died',
    () => tie.mergeReady === false && tie.mergeBlockedBy.some(b => /unadjudicated/.test(b)))
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ 'refute:': () => null },
    mkAgent({ reviews: { _single: [finding({ severity: 'nit' })] } })) })
  await t('an unadjudicated nit does not block — it would not block if confirmed either', () => r.mergeReady === true)
}
{
  let round = 0
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    'claims:plan': () => (round === 1 ? null : undefined),
    'plan:': () => { round++ },
    'plan-review:r1': () => ({ verdict: 'revise', findings: [{ category: 'x', concern: 'y', mustFix: true }] }) }) })
  await t('a dead extractor in a plan round that was then replaced does not block the approved plan',
    () => r.mergeReady === true)
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ 'claims:plan': () => null }) })
  await t('a dead claim extractor at the plan gate blocks mergeReady', () =>
    r.mergeReady === false && r.mergeBlockedBy.some(b => /plan/.test(b)))
}
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(
    { 'red-check:': () => ({ status: 'unverifiable', evidence: 'could not run it' }) }) })
  await t('a RED the checker could not confirm is not a real red', () =>
    r.mergeReady === false && r.slices[0].skipped === 'false red')
}
{
  const r = await runWorkhorse({ args: baseArgs({ maxSlices: 1 }), agentFn: overriding({ slice: () => nSlices(2) }) })
  await t('slices left past the maxSlices cap block mergeReady', () =>
    r.mergeReady === false && r.mergeBlockedBy.some(b => /cap/.test(b)))
}
{
  let r = null
  try {
    r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ 'green:': () => { throw new Error('budget exceeded') } }) })
  } catch {}
  await t('one tree: a slice that throws does not reject the run', () => r !== null)
  await t('...the retro still runs and the slice is reported as not landed', () =>
    r && r.calls.some(c => c.opts.label === 'retro') && r.mergeReady === false &&
    /budget exceeded/.test(r.slices[0].skipped || ''))
}

// ---------------------------------------------------------------------------
// INPUTS THAT WOULD LET A GATE PASS SILENTLY ARE REFUSED, AND A DEAD AGENT IS NO VOTE.
// ---------------------------------------------------------------------------
const rejects = async (args, re) => {
  try { await runWorkhorse({ args, agentFn: mkAgent() }); return false } catch (e) { return re.test(e.message) }
}

console.log('\nconfig that would skip or fake a gate throws:')
await t('maxPlanRounds 0 throws', () => rejects(baseArgs({ maxPlanRounds: 0 }), /maxPlanRounds must be at least 1/))
await t('a fable tier throws', () => rejects(baseArgs({ tiers: { document: 'fable' } }), /never run on fable/))
{
  const r = await runWorkhorse({ args: baseArgs({ reviewStance: 'quorum', reviewConcerns: 'security' }), agentFn: mkAgent() })
  const labels = reviewCalls(r).map(c => c.opts.label).sort()
  await t('a string reviewConcerns is one concern, not its characters',
    () => labels.join() === 'review:s1:quality-standard,review:s1:security')
}

console.log('\na dead refuter is no verdict:')
{
  const deadTwo = { 'refute:1': () => ({ status: 'refuted', evidence: 'guarded' }),
    'refute:2': () => null, 'refute:3': () => null }
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(deadTwo,
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  await t('one refuted vote with two dead does not drop a blocker',
    () => r.mergeReady === false && r.mergeBlockedBy.some(b => /unadjudicated/.test(b)))
}
{
  const claim = 'the cache is write-through'
  const base = mkClaimAgent({ claims: [claim], verdicts: {} })
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(
    { 'refute:2': () => null, 'refute:3': () => null }, base) })
  const p = promptFor(r, 'plan:r1')
  await t('one confirmed vote with two dead does not hold a premise claim',
    () => !p.slice(p.indexOf('VERIFIED PREMISE'), p.indexOf('<spec>')).includes(claim))
}
{
  const claim = 'the cache is write-through'
  const base = mkClaimAgent({ claims: [claim], verdicts: {} })
  let n = 0
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding(
    { 'refute:': (_, o) => (++n <= 3 && o.label !== 'refute:1' ? null : undefined) }, base) })
  const p = promptFor(r, 'plan:r1')
  await t('a transient death is not memoized: the later gate re-proves the claim',
    () => p.slice(p.indexOf('VERIFIED PREMISE'), p.indexOf('<spec>')).includes(claim) &&
          r.calls.filter(c => c.opts.label.startsWith('refute:') && c.prompt.includes(claim)).length === 6)
}

console.log('\na verdict on one slice is not reused for another:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    slice: () => nSlices(2),
    'refute:': prompt => (prompt.includes('Slice: S1') ? { status: 'refuted', evidence: 'guarded' }
      : prompt.includes('Slice: S2') ? { status: 'confirmed', evidence: 'repro' } : undefined) },
    mkAgent({ reviews: { _single: [blockerFinding] } })) })
  const s2 = r.slices.find(s => s.id === 's2')
  await t('s2 keeps its own confirmed blocker', () => s2.verifiedFindings.length === 1 && r.mergeReady === false)
}

console.log('\na grill that dies later keeps the earlier round:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    'grill:r1': () => ({ holes: [], verdict: 'needs-another-round', acceptanceCriteria: ['AC-from-round-1'] }),
    'grill:r2': () => null }) })
  await t('round 1 criteria reach the plan', () => promptFor(r, 'plan:r1').includes('AC-from-round-1'))
}

console.log('\na rejected plan always says why:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    'plan-review:r1': () => ({ verdict: 'revise', findings: [{ category: 'x', concern: 'consider caching', mustFix: false }] }) }) })
  await t('non-must-fix findings are forwarded', () =>
    /consider caching/.test(promptFor(r, 'plan:r2')) && /REJECTED/.test(promptFor(r, 'plan:r2')))
  const r2 = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    'plan-review:r1': () => ({ verdict: 'revise', findings: [] }) }) })
  await t('with no findings the planner still learns it was rejected', () => /REJECTED/.test(promptFor(r2, 'plan:r2')))
}

console.log('\nan approved plan with a refuted claim does not forward optional findings:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    'claims:plan': () => ({ claims: [{ claim: 'plan claim X', blastRadius: 'total' }] }),
    'refute:': prompt => prompt.includes('plan claim X') ? { status: 'refuted', evidence: 'no' } : undefined,
    'plan-review:r1': () => ({ verdict: 'approved', findings: [{ category: 'perf', concern: 'OPTIONAL-consider caching', mustFix: false }] }) }) })
  await t('the refuted claim is forwarded but the optional finding is not', () =>
    promptFor(r, 'plan:r2').includes('plan claim X') && !promptFor(r, 'plan:r2').includes('OPTIONAL-consider caching'))
}

console.log('\nmergeBlockedBy tells the truth about the document phase:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: overriding({ document: () => null }) })
  await t('a dead Document agent is named', () => r.mergeReady === false && r.mergeBlockedBy.some(b => /document/.test(b)))
  const r2 = await runWorkhorse({ args: baseArgs(), agentFn: overriding({
    document: () => ({ docsChanged: [], baselineStillGreen: false, baselineOutput: 'red' }) }) })
  await t('a regressed baseline is listed once',
    () => r2.mergeBlockedBy.filter(b => /baseline regressed/.test(b)).length === 1)
}

console.log('\nevery agent is told the lines it must not cross:')
{
  const r = await runWorkhorse({ args: baseArgs(), agentFn: mkAgent() })
  const WRITERS = /^(baseline|spec|grill:|plan:|plan-review:|slice|red:|green:|document|retro)/
  const READERS = /^(claims:|refute:|red-check:|review:)/
  await t('every agent that writes is told never to push, open a PR or merge', () =>
    r.calls.filter(c => WRITERS.test(c.opts.label)).every(c => /never push/i.test(c.prompt)))
  await t('every checker is told the tree is read-only and which git commands are forbidden', () =>
    r.calls.filter(c => READERS.test(c.opts.label)).every(c => /read-only/i.test(c.prompt) && /git stash/.test(c.prompt)))
}

console.log('\nthis repo is public — no bare issue numbers from elsewhere:')
await t('the script holds no bare #<number> reference', () => !/(^|[^\w/])#\d+/m.test(SRC))

// ---------------------------------------------------------------------------
console.log('')
console.log('stamped output — every line says which run it belongs to:')
{
  const r = await runWorkhorse({ args: baseArgs({ tiers: { plan: 'haiku' }, startedAt: '07-20 09:30' }),
    agentFn: mkAgent() })
  await t('every logged line is prefixed with the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[07-20 09:30] ')))
  await t('...and the stamp is not the whole line (the message survives)',
    () => r.logs.every(m => m.replace('[07-20 09:30] ', '').trim().length > 0))
}
{
  const r2 = await runWorkhorse({ args: baseArgs({ tiers: { plan: 'haiku' } }), agentFn: mkAgent() })
  await t('with NO stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
