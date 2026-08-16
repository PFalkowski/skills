// Tests for housekeeping-cleanup.js — run: node .claude/workflows/housekeeping-cleanup.test.js
//
// This is the only script in the skill that WRITES, so the defects worth guarding are the ones
// where a write happens that nobody approved, or an approved write is reported as done when it is
// not:
//   1. ADMISSION. An action outside the allowlist, a target that is a URL (an authoritative
//      external), a delete with no source of truth — each must be REJECTED WITH ITS REASON, never
//      interpreted. An editor improvising the action it was not given is the whole failure class.
//   2. ONE EDITOR PER FILE. Two agents editing one document in parallel is a lost edit: the second
//      writes over a file it read before the first finished. Grouping is the fix and it is
//      invisible in any test that does not assert on what was dispatched.
//   3. APPLIED MUST MEAN APPLIED. A dead editor, a dead checker, or a checker that found an
//      unapproved new claim must not land in `applied` — a cleanup that invents a claim while
//      removing a stale one has created fresh drift and it looks like success in the report.
// Convention as grill.test.js: add the assertion, then break your fix on purpose and watch it fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'housekeeping-cleanup.js'), 'utf8')
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

const D = o => ({ id: 'D1', doc: 'README.md', action: 'fix-doc', instruction: 'change 30 to 7',
  sourceOfTruth: 'code', proof: 'src/auth/Token.cs:22', ...o })
const baseArgs = (dispositions, o) => ({ dispositions, chronicleDir: '/c', ...o })

const mkAgent = ({ results = null, check = { ok: true, problems: [], newClaims: [] },
                   editorDies = false, checkerDies = false } = {}) =>
  async (prompt, opts) => {
    if (opts.label.startsWith('edit:')) {
      if (editorDies) return null
      if (results) return { results }
      // Default: the editor reports every disposition it was handed as done.
      const ids = [...prompt.matchAll(/- \[(D\d+)\]/g)].map(m => m[1])
      return { results: ids.map(id => ({ id, done: true, what: `applied ${id}`, why: null })) }
    }
    if (opts.label.startsWith('check:')) return checkerDies ? null : check
    throw new Error('unexpected label ' + opts.label)
  }

const why = (arr, id) => (arr.find(x => x.id === id) || {}).why || ''

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('admission — a disposition it cannot execute is rejected, never interpreted:')
{
  for (const action of ['file-ticket', 'ask-human', 'keep', 'fix-code', 'delete-code', undefined]) {
    const r = await run({ args: baseArgs([D({ action })]), agentFn: mkAgent() })
    await t(`action '${action}' is skipped with its reason, and no editor is dispatched`,
      () => r.applied.length === 0 && r.skipped.length === 1 &&
            /not an executable cleanup action/.test(why(r.skipped, 'D1')) &&
            r.dispatched.length === 0)
  }

  for (const doc of ['https://confluence.example.com/x', 'jira://PLAT-12']) {
    const r = await run({ args: baseArgs([D({ doc })]), agentFn: mkAgent() })
    await t(`target '${doc}' is rejected — authoritative externals are read-only`,
      () => r.skipped.length === 1 && /read-only/.test(why(r.skipped, 'D1')) && r.dispatched.length === 0)
  }

  const nosot = await run({ args: baseArgs([D({ action: 'delete-doc', sourceOfTruth: null })]), agentFn: mkAgent() })
  await t('delete-doc with no source of truth is refused — the claim would be left homeless',
    () => nosot.skipped.length === 1 && /sourceOfTruth/.test(why(nosot.skipped, 'D1')) && nosot.dispatched.length === 0)
  const sot = await run({ args: baseArgs([D({ action: 'delete-doc' })]), agentFn: mkAgent() })
  await t('...and the same deletion WITH one is admitted', () => sot.applied.length === 1)

  const noinstr = await run({ args: baseArgs([D({ instruction: '' })]), agentFn: mkAgent() })
  await t('no instruction → skipped; an editor left to infer the edit writes a different one',
    () => noinstr.skipped.length === 1 && /infer/.test(why(noinstr.skipped, 'D1')))

  const noid = await run({ args: baseArgs([D({ id: '' })]), agentFn: mkAgent() })
  await t('no id → skipped; it could not be reported back against the audit', () => noid.skipped.length === 1)

  const empty = await run({ args: baseArgs([]), agentFn: mkAgent() })
  await t('nothing approved → nothing dispatched, and the run is complete',
    () => empty.dispatched.length === 0 && empty.applied.length === 0 && empty.complete === true)
}

console.log('')
console.log('one editor per FILE — parallel edits to one document lose one of them:')
{
  const same = await run({ args: baseArgs([D({ id: 'D1' }), D({ id: 'D2', instruction: 'drop the stale table' })]),
    agentFn: mkAgent() })
  const edits = same.dispatched.filter(d => d.opts.label.startsWith('edit:'))
  await t('two dispositions on one file → ONE editor', () => edits.length === 1)
  await t('...and it is handed both, so it applies them in order',
    () => /\[D1\]/.test(edits[0].prompt) && /\[D2\]/.test(edits[0].prompt))
  await t('...and both come back applied', () => same.applied.length === 2)

  const diff = await run({ args: baseArgs([D({ id: 'D1' }), D({ id: 'D2', doc: 'docs/billing.md' })]),
    agentFn: mkAgent() })
  await t('two files → two editors, in parallel',
    () => diff.dispatched.filter(d => d.opts.label.startsWith('edit:')).length === 2)
  await t('each editor is scoped to exactly one file',
    () => diff.dispatched.filter(d => d.opts.label.startsWith('edit:'))
      .every(d => /Touch NO other file/.test(d.prompt)))
  await t('every prompt forbids spawning and forbids touching code',
    () => diff.dispatched.every(d => /no Agent, Task or Workflow tool/i.test(d.prompt)) &&
          diff.dispatched.filter(d => d.opts.label.startsWith('edit:'))
            .every(d => /Touch NO source code/.test(d.prompt)))
}

console.log('')
console.log('applied means applied — the check is a DIFFERENT agent, and its verdict binds:')
{
  const ok = await run({ args: baseArgs([D()]), agentFn: mkAgent() })
  await t('a clean edit lands in applied', () => ok.applied.length === 1 && ok.applied[0].doc === 'README.md')
  await t('...checked by a second agent that never made the edit',
    () => ok.dispatched.filter(d => d.opts.label.startsWith('check:')).length === 1 &&
          /Check an edit you did not make/.test(ok.dispatched.find(d => d.opts.label.startsWith('check:')).prompt))
  await t('...and the run reports that nothing was committed',
    () => ok.committed === false && ok.complete === true)

  const bad = await run({ args: baseArgs([D()]),
    agentFn: mkAgent({ check: { ok: false, problems: ['the new sentence is not true at Token.cs:22'], newClaims: [] } }) })
  await t('a rejected edit does NOT land in applied', () => bad.applied.length === 0)
  await t('...it lands in failed, with the problem, and the run is not complete',
    () => bad.failed.length === 1 && /not true at Token/.test(bad.failed[0].why) && bad.complete === false)

  const invented = await run({ args: baseArgs([D()]),
    agentFn: mkAgent({ check: { ok: false, problems: [], newClaims: ['claims a retry policy nobody mentioned'] } }) })
  await t('an unapproved NEW claim fails the edit — removing old drift by inventing new drift is the failure mode',
    () => invented.applied.length === 0 && /unapproved new claim: claims a retry policy/.test(invented.failed[0].why))

  const declined = await run({ args: baseArgs([D()]),
    agentFn: mkAgent({ results: [{ id: 'D1', done: false, what: 'nothing', why: 'the paragraph already says 7' }] }) })
  await t('an editor that declines after reading the file is a correct outcome — skipped, with why',
    () => declined.applied.length === 0 && /already says 7/.test(why(declined.skipped, 'D1')))
  await t('...and no checker is paid for an edit that was never made',
    () => declined.dispatched.filter(d => d.opts.label.startsWith('check:')).length === 0)

  const ed = await run({ args: baseArgs([D()]), agentFn: mkAgent({ editorDies: true }) })
  await t('a dead editor goes to FAILED, not skipped — the file may be half-written',
    () => ed.failed.length === 1 && ed.skipped.length === 0 && /partially changed/.test(ed.failed[0].why))

  const cd = await run({ args: baseArgs([D()]), agentFn: mkAgent({ checkerDies: true }) })
  await t('a dead checker leaves the edit applied-but-unverified — failed, and the human is told to look',
    () => cd.applied.length === 0 && /unverified/.test(cd.failed[0].why) && cd.complete === false)

  const broke = await run({ args: baseArgs([D()]), agentFn: mkAgent(),
    budget: { total: 1, remaining: () => 0, spent: () => 1 } })
  await t('under reserve: no editor runs, and the disposition is visibly skipped',
    () => broke.applied.length === 0 && /under reserve/.test(why(broke.skipped, 'D1')) && broke.complete === false)
}

console.log('')
console.log('stamped output:')
{
  const r = await run({ args: baseArgs([D()], { startedAt: '08-15 21:04' }), agentFn: mkAgent() })
  await t('every logged line carries the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[08-15 21:04] ')))
  const r2 = await run({ args: baseArgs([D()]), agentFn: mkAgent() })
  await t('with no stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
