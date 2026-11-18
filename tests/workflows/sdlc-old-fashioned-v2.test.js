// Pins what sdlc-old-fashioned-v2/SKILL.md says about how far its block travels through the real
// workflows/sdlc-workhorse.js — run: node tests/workflows/sdlc-old-fashioned-v2.test.js
//
// The overlay reaches a workflow run only as text appended to `goal`, and the script is not
// changed for it. So every reach statement in the overlay is a claim about this script, and this
// test runs the script with stub agents to keep each one true. The Spec stub is literal on purpose:
// it copies only the numbered rules it finds, so an instruction left outside them is dropped here
// the way a literal Spec agent drops it.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '../..')
const RAW = fs.readFileSync(path.join(ROOT, 'workflows', 'sdlc-workhorse.js'), 'utf8')
const SRC = RAW.replace(/^export const meta = \{[\s\S]*?^\}$/m, '')
const OVERLAY = path.join(ROOT, 'sdlc-old-fashioned-v2', 'SKILL.md')
const STALE = "sdlc-old-fashioned-v2's channel statement is stale: "

async function runWorkhorse ({ args, agentFn }) {
  const calls = []
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
  const out = await fn(args, { total: null, spent: () => 0, remaining: () => Infinity },
    spy, parallel, pipeline, () => {}, () => {})
  return { ...out, calls }
}

let pass = 0, fail = 0
const t = async (n, fn) => { try { if (await fn()) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log(STALE + n) } } catch (e) { fail++; console.log(STALE + n + ': ' + e.message) } }
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

const GRILL_AC = 'GRILL-CRITERION-MARK'
const TEST_STRATEGY = 'TEST-STRATEGY-MARK'
const SLICE_AC = 'SLICE-CRITERION-MARK'
const isRule = l => /^\d+\. /.test(l)

const mkAgent = ({ blockLines, grillWritesCriteria }) => async (prompt, { label }) => {
  if (label === 'baseline') return { green: true, pitfalls: [], missingGuardrails: [],
    checks: [{ command: 'npm test', passed: true, output: 'ok' }] }
  if (label === 'spec') {
    const copied = prompt.split('\n').filter(l => isRule(l) && blockLines.includes(l))
    return { problem: 'p', goal: 'g', scope: copied, nonGoals: ['n'], successCriteria: copied }
  }
  if (label === 'claims:plan') return { claims: [{ claim: 'the lease is taken in one step', whyLoadBearing: 'w',
    blastRadius: 'major', quote: 'one step' }] }
  if (label.startsWith('claims:')) return { claims: [] }
  if (label.startsWith('quotes:')) return { missing: [] }
  if (label.startsWith('grill:')) return { holes: [], verdict: 'sharp',
    ...(grillWritesCriteria ? { acceptanceCriteria: [GRILL_AC] } : {}) }
  if (label.startsWith('plan:')) return { approach: 'design '.repeat(700), components: ['c'],
    failureModes: [{ failure: 'f', blockedBy: 'b' }], alternativesRejected: [{ alternative: 'x', whyRejected: 'y' }],
    testStrategy: TEST_STRATEGY, planPath: 'docs/plan.md' }
  if (label.startsWith('plan-review:')) return { verdict: 'approved', findings: [] }
  if (label === 'slice') return { slices: [{ id: 's1', title: 'S1', acceptanceCriterion: SLICE_AC, effort: 'low' }] }
  if (label.startsWith('red-check:')) return { status: 'confirmed', evidence: 'failed on the assertion' }
  if (label.startsWith('red:')) return { testPath: 't.js', testCommand: 'npm test', output: 'FAIL', failedForTheRightReason: true }
  if (label.startsWith('green:')) return { passed: true, output: 'PASS', summary: 'done' }
  if (label.startsWith('review:')) return { findings: [{ summary: 'lease taken twice', failureScenario: 'two workers race',
    severity: 'minor', file: 'a.js' }] }
  if (label.startsWith('refute:')) return { status: 'confirmed', evidence: 'reproduced it' }
  if (label === 'document') return { docsChanged: ['README.md'], adrsWritten: [], baselineStillGreen: true, baselineOutput: 'ok' }
  if (label === 'retro') return { lessons: [], reflection: 'r' }
  throw new Error(`unstubbed agent label: ${label}`)
}

const prompt = (r, label) => (r.calls.find(c => c.opts.label === label) || {}).prompt || ''
const refutes = (r, phase) => r.calls.filter(c => c.opts.label.startsWith('refute:') && c.opts.phase === phase)
const holdsAll = (text, parts) => parts.every(p => text.includes(p))

;(async () => {
if (!fs.existsSync(OVERLAY)) { fail++; console.log(STALE + 'sdlc-old-fashioned-v2/SKILL.md does not exist'); return done() }
const blocks = [...fs.readFileSync(OVERLAY, 'utf8').matchAll(/^```[^\n]*\n([\s\S]*?)^```$/gm)].map(m => m[1].trim())
const block = blocks[0] || ''
const blockLines = block.split('\n').filter(l => l.trim())
const first = blockLines.findIndex(isRule)
const header = first < 0 ? blockLines : blockLines.slice(0, first)
const rules = first < 0 ? [] : blockLines.slice(first)

console.log('the block:')
await t('the overlay holds exactly one fenced block, and it is not empty', () => blocks.length === 1 && block.length > 0)
await t('the block has a header line before its rules', () => header.length >= 1)
await t('every line from the first rule on is a numbered rule', () => rules.length > 0 && rules.every(isRule))
await t('the rules are numbered 1 to 5', () => rules.map(l => l.split('.')[0]).join() === '1,2,3,4,5')
for (const field of ['testStrategy', 'acceptanceCriterion']) {
  await t(`${field} is named inside a rule and in no header line`,
    () => rules.some(l => l.includes(field)) && !header.some(l => l.includes(field)))
  await t(`the workflow script still has the field ${field}`, () => RAW.includes(field))
}

const goal = 'Add a lease that two workers cannot both hold.\n\n' + block
const a = await runWorkhorse({ args: { goal, chronicleDir: '/c' }, agentFn: mkAgent({ blockLines, grillWritesCriteria: true }) })

console.log('\nscenario A, the grill writes acceptance criteria:')
await t('goal is put into the baseline, spec and document prompts',
  () => ['baseline', 'spec', 'document'].every(l => prompt(a, l).includes(block)))
await t('the rules the Spec agent copies travel in the spec to the grill, the plan and the plan review',
  () => ['grill:r1', 'plan:r1', 'plan-review:r1'].every(l => holdsAll(prompt(a, l), rules)))
await t('...but the header does not', () => !header.some(h => prompt(a, 'plan:r1').includes(h)))
await t("the grill's acceptance criteria reach the plan and the slicer",
  () => prompt(a, 'plan:r1').includes(GRILL_AC) && prompt(a, 'slice').includes(GRILL_AC))
await t("...and replace the spec's success criteria: no rule reaches the slicer",
  () => !rules.some(r => prompt(a, 'slice').includes(r)))
await t("the plan's testStrategy reaches the plan review, the slicer, RED, GREEN and document",
  () => ['plan-review:r1', 'slice', 'red:s1', 'green:s1', 'document'].every(l => prompt(a, l).includes(TEST_STRATEGY)))
await t("the plan's claim-checkers see only the start of the plan, so a late testStrategy misses them",
  () => refutes(a, 'Plan review').length > 0 &&
    refutes(a, 'Plan review').every(c => c.prompt.includes('"approach"') && !c.prompt.includes(TEST_STRATEGY)))
await t("a slice's acceptanceCriterion reaches RED, the RED check and the review",
  () => ['red:s1', 'red-check:s1', 'review:s1'].every(l => prompt(a, l).includes(SLICE_AC)) &&
    refutes(a, 'Review').length > 0 && refutes(a, 'Review').every(c => c.prompt.includes(SLICE_AC)))
await t('the result returns the spec, whose scope holds the rules, and the plan, with its testStrategy',
  () => holdsAll(a.spec.scope.join('\n'), rules) && a.plan.testStrategy === TEST_STRATEGY)
await t('the review prompt names code-review-grill, never code-review-grill-v2',
  () => prompt(a, 'review:s1').includes('"code-review-grill" skill') && !RAW.includes('code-review-grill-v2'))

const b = await runWorkhorse({ args: { goal, chronicleDir: '/c' }, agentFn: mkAgent({ blockLines, grillWritesCriteria: false }) })

console.log('\nscenario B, the grill writes no acceptance criteria:')
await t('every rule reaches the slicer through the spec', () => holdsAll(prompt(b, 'slice'), rules))

done()
})()
