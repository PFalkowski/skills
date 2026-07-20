// Tests for grill.js — run: node .claude/workflows/grill.test.js
//
// The defect class this guards is THE WALL (#46): an agent inside a Workflow cannot spawn, and
// nothing throws when it tries — so the only place independence can be real is the script's own
// fan-out, and the only way to test it is to run the REAL script with stubbed agent/parallel and
// assert on WHAT WAS DISPATCHED and WHAT CAME BACK. A test of the reviewer prompt cannot see a
// quorum that silently collapsed into one context, and a unit test of the dedup cannot see a
// dead verifier being read as a clean verdict. Convention as hunt.test.js / sdlc-workhorse.test.js:
// when you change grill.js, add the assertion, then BREAK YOUR FIX ON PURPOSE and watch it fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'grill.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function runGrill ({ args, agentFn, budget = {} }) {
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

const F = o => ({ title: 'missing null check', file: 'src/db.ts', line: 40, severity: 'high',
  failureScenario: 'null user → crash', evidence: 'db.ts:40', suggestion: null, ...o })
const baseArgs = o => ({ pr: 7, title: 'fix: parse', url: 'u', range: 'aaa..bbb',
  files: ['src/db.ts'], stance: 'single', concerns: [], known: [],
  chronicleDir: '/c', libraryIndex: '/l', ...o })
const mkAgent = ({ findings = [], verdicts = [{ refuted: false, why: 'holds', severity: null, proof: 'p' }],
                   reviewerDies = false, verifierDies = false, rulesDie = false } = {}) => {
  let vi = -1
  return async (prompt, opts) => {
    if (opts.label === 'house-rules') return rulesDie ? null : 'RULES'
    if (opts.label.startsWith('grill')) return reviewerDies ? null : { findings }
    if (opts.label.startsWith('verify')) { vi++; return verifierDies ? null : verdicts[vi % verdicts.length] }
    throw new Error('unexpected label ' + opts.label)
  }
}
const KEY = 'src/db.ts:missing-null-check'

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('the wall — independence is the SCRIPT\'s fan-out, not a prompt\'s claim:')
{
  const q = await runGrill({ args: baseArgs({ stance: 'quorum', concerns: ['security', 'architecture', 'tests'] }),
    agentFn: mkAgent({ findings: [F()] }) })
  await t('quorum dispatches ONE reviewer agent PER concern (not one agent told "be a quorum")',
    () => q.dispatched.filter(d => d.opts.label.startsWith('grill:')).length === 3)
  await t('each quorum reviewer is scoped to a single lens',
    () => q.dispatched.filter(d => d.opts.label.startsWith('grill:'))
      .every(d => /YOUR LENS/.test(d.prompt)))
  await t('every dispatched prompt forbids spawning (the failure is silent, so the prompt must say it)',
    () => q.dispatched.every(d => /do NOT try to convene|no Agent, Task, or Workflow tool/i.test(d.prompt)))
  await t('concernsRun records the concerns whose reviewer returned',
    () => q.concernsRun.length === 3 && q.concernsRun.includes('security'))

  const s = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [F()] }) })
  await t('single stance dispatches exactly one reviewer',
    () => s.dispatched.filter(d => d.opts.label.startsWith('grill')).length === 1)
  await t('reviewers diff the explicit range, never HEAD',
    () => s.dispatched.filter(d => d.opts.label.startsWith('grill'))
      .every(d => d.prompt.includes('git diff aaa..bbb')))
}

console.log('silence is never a clean review — complete gates the grilled ledger:')
{
  const dead = await runGrill({ args: baseArgs(), agentFn: mkAgent({ reviewerDies: true }) })
  await t('a dead reviewer lands in uncovered', () => dead.uncovered.length === 1)
  await t('...and complete=false, so the watcher must NOT ledger the sha', () => dead.complete === false)

  const vdead = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [F()], verifierDies: true }) })
  await t('a dead verifier leaves the finding unjudged: not in findings', () => vdead.findings.length === 0)
  await t('...not silently gone either — uncovered, complete=false',
    () => vdead.uncovered.length === 1 && vdead.complete === false)

  const clean = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('a genuinely clean diff IS complete — empty findings, no uncovered',
    () => clean.findings.length === 0 && clean.complete === true)

  const broke = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [F()] }),
    budget: { total: 1, remaining: () => 0, spent: () => 1 } })
  await t('under reserve: reviewer never runs → uncovered, not a clean pass',
    () => broke.complete === false && broke.findings.length === 0)
}

console.log('verification is the only floor — everything that survives posts, nits included:')
{
  const nit = await runGrill({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F({ severity: 'nit', title: 'idiom drift' })] }) })
  await t('a verified nit survives to findings', () => nit.findings.length === 1 && nit.findings[0].severity === 'nit')

  const killed = await runGrill({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true, why: 'guarded upstream', severity: null, proof: null }] }) })
  await t('a refuted finding is dropped from findings', () => killed.findings.length === 0)
  await t('...and recorded in refuted with the reason', () => killed.refuted.length === 1 && /guarded upstream/.test(killed.refuted[0]))

  const mixed = await runGrill({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F({ title: 'a', severity: 'nit' }), F({ title: 'b', severity: 'critical' })],
      verdicts: [{ refuted: false, why: 'w', severity: null, proof: 'p' }] }) })
  await t('findings sort worst-first', () => mixed.findings[0].severity === 'critical')
  await t('surviving findings carry a dedup key for the watcher\'s next-grill known list',
    () => mixed.findings.every(f => typeof f.key === 'string' && f.key.includes(':')))
}

console.log('dedup — restatements within a run, standing threads across runs:')
{
  const dup = await runGrill({ args: baseArgs({ stance: 'quorum', concerns: ['security', 'tests'] }),
    agentFn: mkAgent({ findings: [F()] }) })
  await t('two lenses restating one finding verify it once', () => dup.findings.length === 1)

  const kn = await runGrill({ args: baseArgs({ known: [KEY] }), agentFn: mkAgent({ findings: [F()] }) })
  await t('a finding whose thread already stands on the PR is not re-verified or re-returned',
    () => kn.findings.length === 0 && kn.alreadyPosted.length === 1)
  await t('...and the run is still complete — a standing thread is accounted for, not uncovered',
    () => kn.complete === true)
  await t('dedup key ignores the line number (lines shift between shas; drift must cost a duplicate, never a re-post storm)',
    () => KEY.indexOf('40') === -1)
}

console.log('house rules — distilled once, degraded is disclosed:')
{
  const ok = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('reviewers receive the distilled house rules',
    () => ok.dispatched.filter(d => d.opts.label.startsWith('grill')).every(d => d.prompt.includes('RULES')))

  const dead = await runGrill({ args: baseArgs(), agentFn: mkAgent({ findings: [], rulesDie: true }) })
  await t('dead rules agent → reviewers told to read the docs themselves',
    () => dead.dispatched.filter(d => d.opts.label.startsWith('grill'))
      .every(d => /Read the repo's own docs/.test(d.prompt)))
}

// ---------------------------------------------------------------------------
// STAMPED OUTPUT. The stamp identifies WHICH RUN a line came from. It is the
// watcher's clock, passed in — the script has none (Date.now() throws here), so
// the failures to guard are a line that silently loses its stamp, and an absent
// stamp rendering as "[undefined]", which reads like a real timestamp.
// ---------------------------------------------------------------------------
console.log('')
console.log('stamped output — every line says which run it belongs to:')
{
  const r = await runGrill({ args: baseArgs({ startedAt: '07-20 09:30' }),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true, why: 'guarded upstream', severity: null, proof: null }] }) })
  await t('every logged line is prefixed with the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[07-20 09:30] ')))
  await t('...and the stamp is not the whole line (the message survives)',
    () => r.logs.every(m => m.replace('[07-20 09:30] ', '').trim().length > 0))
}
{
  const r2 = await runGrill({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true, why: 'guarded upstream', severity: null, proof: null }] }) })
  await t('with NO stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
