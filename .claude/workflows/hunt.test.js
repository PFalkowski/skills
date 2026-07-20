// Tests for hunt.js — run: node .claude/workflows/hunt.test.js
//
// WHY THIS EXISTS, and how to use it.
//
// hunt.js carries a maintenance contract it cannot enforce alone: every way a finding can leave
// `confirmed` must join the `accountedFor` union, or the fire reads its absence as a fix and
// reports the next sighting as a regression against a fix that never happened. Every serious bug
// this script has had was that same shape — a CORRECT RULE, DEFEATED AT THE SEAM WHERE IT'S
// INVOKED. triage() called one line before the id it reads. A budget guard checked inside a
// fan-out where nothing had spent yet. `known` fed `pending`, so a crash buried a finding forever.
// Five exclusion sets holding three element types, so one .includes() answered "absent" for three.
// Not one of those rules was wrong. Every one of them read fine. All five were invisible to a unit
// test of the rule, because such a test calls the rule the way the rule wants to be called.
//
// So these tests run the REAL script with stubbed agent/parallel/pipeline and assert on its RETURN
// VALUE. When you change hunt.js: add the assertion, then BREAK YOUR FIX ON PURPOSE and watch it
// fail. A test that has never failed is a decoration.
//
// The stubs mirror the documented Workflow contract, which is the authority here:
//   - parallel(thunks) resolves a throwing thunk to null and NEVER rejects
//   - pipeline(items, ...stages) passes (prevResult, originalItem, index) to each stage
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'hunt.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function runHunt ({ args, agentFn, budget = {} }) {
  const logs = []
  const fn = new Function('args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const s of stages) v = await s(v, item, i)
    return v
  }))
  const out = await fn(args, budget, agentFn, parallel, pipeline, () => {}, m => logs.push(m))
  return { ...out, logs }
}

const F = o => ({ title: 'sqli in parseQuery', file: 'src/db.ts', symbol: 'parseQuery', subject: 'userId',
  flaw: 'unescaped-input-in-query', severity: 'high', failurePath: 'user input reaches LIKE',
  evidence: 'db.ts:40', ...o })
const baseArgs = o => ({ range: 'aaa..bbb', files: ['src/db.ts', 'package.json'], manifests: [],
  lenses: ['injection'], known: {}, fixed: [], carry: [], chronicleDir: '/c', libraryIndex: '/l', ...o })
const mkAgent = ({ findings = [], verdicts = [{ refuted: false }], hunterDies = false } = {}) =>
  async (prompt, opts) => {
    if (opts.label.startsWith('hunter:')) return hunterDies ? null : { findings }
    const i = mkAgent.i = (mkAgent.i ?? -1) + 1
    return verdicts[i % verdicts.length]
  }
const ID = 'injection:src/db.ts:parsequery:userid:unescaped-input-in-query'

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('rule 3 fires on HUNTED findings (the seam: triage() reads f.id, so id must exist first):')
{
  mkAgent.i = -1
  const r = await runHunt({ args: baseArgs({ known: { [ID]: 'high' } }), agentFn: mkAgent({ findings: [F()] }) })
  await t('a known finding at the same severity is dropped', () => r.confirmed.length === 0)
  await t('...and lands in stillPresent (so the fire cannot call it fixed)',
    () => r.stillPresent.length === 1 && r.stillPresent[0] === ID)

  mkAgent.i = -1
  const esc = await runHunt({ args: baseArgs({ known: { [ID]: 'medium' } }),
    agentFn: mkAgent({ findings: [F({ severity: 'critical' })] }) })
  await t('a known finding at a WORSE severity is an escalation',
    () => esc.confirmed.length === 1 && esc.confirmed[0].escalation === 'medium → critical')
  await t('...and is not in stillPresent — it is news', () => esc.stillPresent.length === 0)

  mkAgent.i = -1
  const reg = await runHunt({ args: baseArgs({ fixed: [ID] }), agentFn: mkAgent({ findings: [F()] }) })
  await t('a fixed finding come back is a regression', () => reg.confirmed[0]?.regression === true)

  mkAgent.i = -1
  const fresh = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [F()] }) })
  await t('an unknown finding is reported with the computed id', () => fresh.confirmed[0]?.id === ID)
}

console.log('accountedFor — ONE flat id set; the fire must never re-derive it across types:')
{
  mkAgent.i = -1
  const known = await runHunt({ args: baseArgs({ known: { [ID]: 'high' } }), agentFn: mkAgent({ findings: [F()] }) })
  await t('stillPresent id is in accountedFor', () => known.accountedFor.includes(ID))

  mkAgent.i = -1
  const conf = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [F()] }) })
  await t('a confirmed finding is in accountedFor (confirmed holds OBJECTS)', () => conf.accountedFor.includes(ID))

  mkAgent.i = -1
  const killed = await runHunt({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true }, { refuted: true }, { refuted: false }] }) })
  await t('2-of-3 refuted => dropped from confirmed', () => killed.confirmed.length === 0)
  await t('...recorded in refuted, and in accountedFor', () => killed.accountedFor.includes(ID))

  mkAgent.i = -1
  const many = Array.from({ length: 12 }, (_, i) => F({ subject: `p${i}` }))
  const capped = await runHunt({ args: baseArgs({ maxFindings: 8 }), agentFn: mkAgent({ findings: many }) })
  await t('deferred candidates are in accountedFor as ids (deferred holds OBJECTS)',
    () => capped.deferred.every(d => capped.accountedFor.includes(d.id)))

  mkAgent.i = -1
  const ab = await runHunt({ args: baseArgs({ lenses: [], carry: [{ ...F(), id: ID, lens: 'injection', attempts: 3 }] }),
    agentFn: mkAgent({}) })
  await t('an abandoned candidate is in accountedFor as an id (dropped holds PROSE)',
    () => ab.accountedFor.includes(ID))
  await t('accountedFor holds only strings — one type the fire can test',
    () => ab.accountedFor.every(x => typeof x === 'string'))

  mkAgent.i = -1
  const gone = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('a genuinely gone finding is NOT in accountedFor (producer 2 may fire)',
    () => !gone.accountedFor.includes(ID))
}

console.log('coverage vs deferral — only `uncovered` may hold the watermark:')
{
  mkAgent.i = -1
  const many = Array.from({ length: 12 }, (_, i) => F({ subject: `p${i}` }))
  const capped = await runHunt({ args: baseArgs({ maxFindings: 8 }), agentFn: mkAgent({ findings: many }) })
  await t('over maxFindings => deferred, not uncovered', () => capped.deferred.length === 4 && capped.uncovered.length === 0)
  await t('...so the watermark advances (no livelock)', () => capped.complete === true)
  await t('...and the 8 most severe were refuted', () => capped.confirmed.length === 8)

  mkAgent.i = -1
  const broke = await runHunt({ args: baseArgs({ reserve: 40000 }), budget: { total: 100000, remaining: () => 10000 },
    agentFn: mkAgent({ findings: [F()] }) })
  await t('under reserve => lens never ran, uncovered, watermark held',
    () => broke.uncovered.length === 1 && broke.complete === false)

  mkAgent.i = -1
  const dead = await runHunt({ args: baseArgs({ lenses: ['injection', 'authz'] }),
    agentFn: async (p, o) => o.label === 'hunter:injection' ? null
      : o.label.startsWith('hunter:') ? { findings: [] } : { refuted: false } })
  await t('a DEAD hunter is excluded from lensesRun (coverage is never inferred from silence)',
    () => dead.lensesRun.includes('authz') && !dead.lensesRun.includes('injection'))
  await t('...and holds the watermark', () => dead.complete === false)
}

console.log('carry — a queue, and queues rot:')
{
  mkAgent.i = -1
  const carried = await runHunt({ args: baseArgs({ lenses: [],
      carry: [{ ...F(), id: ID, lens: 'injection', canonFile: 'src/db.ts', range: 'old..range', attempts: 1 }] }),
    agentFn: mkAgent({ verdicts: [{ refuted: false }] }) })
  await t('a carried candidate is refuted without re-hunting', () => carried.confirmed.length === 1)
  await t('...attempts incremented', () => carried.confirmed[0].attempts === 2)

  mkAgent.i = -1
  const exhausted = await runHunt({ args: baseArgs({ lenses: [],
      carry: [{ ...F(), id: ID, lens: 'injection', attempts: 3 }] }), agentFn: mkAgent({}) })
  await t('past maxAttempts => abandoned', () => exhausted.confirmed.length === 0)
  await t('...and said out loud in `dropped` (no silent cap)', () => exhausted.dropped.length === 1)

  const mkC = n => Array.from({ length: n }, (_, i) =>
    ({ ...F({ subject: `p${i}` }), id: `injection:src/db.ts:parsequery:p${i}:unescaped-input-in-query`,
       lens: 'injection', canonFile: 'src/db.ts', attempts: 0 }))
  mkAgent.i = -1
  const over = await runHunt({ args: baseArgs({ lenses: [], maxCarry: 5, carry: mkC(8) }),
    agentFn: mkAgent({ verdicts: [{ refuted: false }] }) })
  await t('over maxCarry => DEFERRED (the rewrite\'s source set), not dropped',
    () => over.deferred.length === 3 && over.dropped.length === 0)
  await t('...so it survives the rewrite instead of being deleted every hunt',
    () => over.deferred.every(d => over.accountedFor.includes(d.id)))
  await t('...and the 5 within the cap were refuted', () => over.confirmed.length === 5)

  mkAgent.i = -1
  const dupe = await runHunt({ args: baseArgs({
      carry: [{ ...F(), id: ID, lens: 'injection', canonFile: 'src/db.ts', attempts: 0 }] }),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: false }] }) })
  await t('a carried candidate re-found by its own lens is deduped by id', () => dupe.confirmed.length === 1)
  await t('...and is not marked as its own corroboration', () => dupe.confirmed[0].corroborated === undefined)
}

console.log('paths — canonicalize, do not gatekeep:')
{
  mkAgent.i = -1
  const wt = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [F({ file: 'C:/tmp/wt-9f/src/db.ts' })] }) })
  await t('a worktree-absolute path matching the muster snaps to canonical',
    () => wt.confirmed[0]?.canonFile === 'src/db.ts' && wt.confirmed[0]?.pathVerified === true)
  await t('...and gets the same id as if reported repo-relative', () => wt.confirmed[0]?.id === ID)

  mkAgent.i = -1
  const caller = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [F({ file: 'src/api/handler.ts' })] }) })
  await t('a finding in an untouched CALLER is kept (rule 5 puts it in scope)', () => caller.confirmed.length === 1)
  await t('...marked unverified', () => caller.confirmed[0].pathVerified === false)
  await t('...and does not freeze the watermark', () => caller.complete === true)

  mkAgent.i = -1
  const bad = await runHunt({ args: baseArgs(), agentFn: mkAgent({ findings: [F({ file: '/tmp/wt-9f/x/y.ts' })] }) })
  await t('a leaked worktree absolute is still reported', () => bad.confirmed.length === 1)
  await t('...but its ephemeral path is out of the id (else an hourly duplicate forever)',
    () => !bad.confirmed[0].id.includes('tmp'))
}

console.log('corroboration — distinct lenses only:')
{
  mkAgent.i = -1
  const two = await runHunt({ args: baseArgs({ lenses: ['injection', 'authz'] }),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: false }] }) })
  await t('two distinct lenses on one defect => corroborated',
    () => two.confirmed.every(f => f.corroborated?.length === 2))

  mkAgent.i = -1
  const mal = await runHunt({ args: baseArgs({ lenses: ['injection', 'authz'] }),
    agentFn: async (p, o) => o.label.startsWith('hunter:')
      ? { findings: [F({ file: `/tmp/wt-${o.label}/src/x.ts` })] } : { refuted: false } })
  await t('...still corroborate when each worktree reports a different absolute path',
    () => mal.confirmed.every(f => f.corroborated?.length === 2))
}

console.log('throws — parallel() resolves throwers to null and never rejects:')
{
  mkAgent.i = -1
  const rboom = await runHunt({ args: baseArgs({ lenses: ['injection'] }),
    agentFn: async (p, o) => {
      if (o.label.startsWith('hunter:')) return { findings: [F()] }
      throw new Error('refuter exploded')
    } })
  await t('every refuter throwing => deferred, not refuted (infrastructure is not a verdict)',
    () => rboom.deferred.length === 1 && rboom.refuted.length === 0)
  await t('...and it stays accountedFor', () => rboom.accountedFor.includes(ID))
  await t('...while the lens DID examine the delta, so the watermark may advance',
    () => rboom.complete === true && rboom.lensesRun.includes('injection'))

  mkAgent.i = -1
  const sboom = await runHunt({ args: baseArgs({ lenses: ['injection'] }),
    agentFn: async (p, o) => o.label.startsWith('hunter:')
      ? { get findings () { throw new Error('malformed payload') } } : { refuted: false } })
  await t('a synchronous stage-2 throw retracts the lens from lensesRun',
    () => !sboom.lensesRun.includes('injection'))
  await t('...lands in uncovered', () => sboom.uncovered.some(u => u.includes('stage failed')))
  await t('...and holds the watermark', () => sboom.complete === false)
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
  mkAgent.i = -1
  const r = await runHunt({ args: baseArgs({ startedAt: '07-20 09:30' }),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true }, { refuted: true }, { refuted: false }] }) })
  await t('every logged line is prefixed with the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[07-20 09:30] ')))
  await t('...and the stamp is not the whole line (the message survives)',
    () => r.logs.every(m => m.replace('[07-20 09:30] ', '').trim().length > 0))
}
{
  mkAgent.i = -1
  const r2 = await runHunt({ args: baseArgs(),
    agentFn: mkAgent({ findings: [F()], verdicts: [{ refuted: true }, { refuted: true }, { refuted: false }] }) })
  await t('with NO stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
