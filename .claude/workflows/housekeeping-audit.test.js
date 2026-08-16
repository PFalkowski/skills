// Tests for housekeeping-audit.js — run: node .claude/workflows/housekeeping-audit.test.js
//
// What this guards, in order of how expensive the failure is:
//   1. SILENCE READ AS CLEAN. A dead auditor, an unread external, a dead verifier — every one of
//      them produces an empty findings array, which is exactly what a genuinely tidy repo produces.
//      If `uncovered`/`complete` do not separate them, the run's headline ("documentation is in
//      order") is a lie that retires the user's suspicion. This is the whole reason the script
//      returns a completeness gate at all.
//   2. THE WALL (#46): an agent inside a Workflow cannot spawn, and nothing throws when it tries.
//      Independence is only real if the SCRIPT fans out — so the assertions are on what was
//      dispatched, which a prompt-level test cannot see.
//   3. Area-sharding: two documents about one area must reach ONE auditor, or a contradiction
//      between them is invisible at any price.
// Convention as grill.test.js: when you change the script, add the assertion, then BREAK YOUR FIX
// ON PURPOSE and watch it fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, 'housekeeping-audit.js'), 'utf8')
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

const DOCS = [
  { path: 'README.md', type: 'readme', area: 'auth' },
  { path: 'docs/adr/0001-auth.md', type: 'adr', area: 'auth' },
  { path: 'docs/billing.md', type: 'guide', area: 'billing' },
  { path: 'src/billing/Invoice.cs', type: 'comments', area: 'billing' },
]
const F = o => ({ kind: 'drift', doc: 'README.md', docLine: 12, claim: 'tokens expire after 30 days',
  reality: 'they expire after 7', codeAnchor: 'src/auth/Token.cs:22', sourceOfTruth: 'code',
  action: 'fix-doc', instruction: 'change 30 to 7', effort: 'S', evidence: 'Token.cs:22', ...o })
const baseArgs = o => ({ paths: null, includeComments: true, externals: [], perShard: 1, maxShards: 6,
  chronicleDir: '/c', ...o })

const mkAgent = ({ docs = DOCS, findings = [F()], verdict = { refuted: false, why: 'holds', proof: 'p' },
                   inventoryDies = false, auditorDies = false, verifierDies = false,
                   externalDies = false, consolidatorDies = false } = {}) =>
  async (prompt, opts) => {
    if (opts.label === 'inventory') return inventoryDies ? null : { docs }
    if (opts.label.startsWith('external:')) return externalDies ? null : 'AUTHORITATIVE: retention is 7 days [PLAT-12]'
    if (opts.label.startsWith('audit:')) return auditorDies ? null : { findings }
    if (opts.label.startsWith('verify:')) return verifierDies ? null : verdict
    if (opts.label === 'consolidate') return consolidatorDies ? null : 'CONSOLIDATED'
    throw new Error('unexpected label ' + opts.label)
  }

let pass = 0, fail = 0
const t = async (n, fn) => { try { const r = await fn(); if (r) { pass++; console.log('  ok  ' + n) }
  else { fail++; console.log('FAIL  ' + n) } } catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
console.log('silence is never a clean bill of health:')
{
  const dead = await run({ args: baseArgs(), agentFn: mkAgent({ inventoryDies: true }) })
  await t('a dead inventory stops the run — not "no documentation found"',
    () => dead.complete === false && dead.findings.length === 0 && /inventory agent died/.test(dead.uncovered[0]))
  await t('...and no auditor was dispatched against an inventory that never arrived',
    () => dead.dispatched.filter(d => d.opts.label.startsWith('audit:')).length === 0)

  const none = await run({ args: baseArgs(), agentFn: mkAgent({ docs: [] }) })
  await t('an empty inventory is reported as such, and is NOT complete',
    () => none.complete === false && /no documentation artifacts/.test(none.uncovered[0]))

  const ad = await run({ args: baseArgs(), agentFn: mkAgent({ auditorDies: true }) })
  await t('a dead auditor names the documents it left unexamined',
    () => ad.complete === false && ad.uncovered.some(u => /unexamined/.test(u) && /README\.md/.test(u)))

  const vd = await run({ args: baseArgs(), agentFn: mkAgent({ verifierDies: true }) })
  await t('a dead verifier leaves the finding unjudged — not in findings...',
    () => vd.findings.length === 0)
  await t('...and not silently gone either', () => vd.complete === false && vd.uncovered.some(u => /unjudged/.test(u)))

  const ed = await run({ args: baseArgs({ externals: [{ name: 'Confluence', how: 'mcp' }] }),
    agentFn: mkAgent({ externalDies: true }) })
  await t('an unread authoritative source is uncovered — its claims were never checked',
    () => ed.complete === false && ed.uncovered.some(u => /Confluence/.test(u)))

  const clean = await run({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('genuinely tidy documentation IS complete — empty findings, nothing uncovered',
    () => clean.findings.length === 0 && clean.complete === true)

  const broke = await run({ args: baseArgs(), agentFn: mkAgent(),
    budget: { total: 1, remaining: () => 0, spent: () => 1 } })
  await t('under reserve: auditors never run → uncovered, not a clean pass',
    () => broke.complete === false && broke.findings.length === 0)
}

console.log('')
console.log('the wall — the fan-out is the script\'s, and it shards BY AREA:')
{
  const r = await run({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  const audits = r.dispatched.filter(d => d.opts.label.startsWith('audit:'))
  await t('two areas → two auditors (perShard 1, maxShards 6)', () => audits.length === 2)
  await t('both auth documents reach ONE auditor — a contradiction between them must be visible',
    () => audits.some(d => d.prompt.includes('README.md') && d.prompt.includes('docs/adr/0001-auth.md')))
  await t('...and that auditor is not also handed the billing documents',
    () => audits.some(d => d.prompt.includes('README.md') && !d.prompt.includes('docs/billing.md')))
  await t('every prompt forbids spawning (the failure is silent, so it must be said)',
    () => r.dispatched.every(d => /no Agent, Task or Workflow tool/i.test(d.prompt)))
  await t('every prompt forbids editing, and names the externals as read-only',
    () => r.dispatched.filter(d => d.opts.label.startsWith('audit:') || d.opts.label.startsWith('verify:'))
      .every(d => /Edit NOTHING/.test(d.prompt) && /Confluence,\s+Jira,\s+Azure DevOps/.test(d.prompt)))

  const one = await run({ args: baseArgs({ perShard: 8 }), agentFn: mkAgent({ findings: [] }) })
  await t('a small doc surface collapses to a single auditor (dynamic, not a fixed fan-out)',
    () => one.dispatched.filter(d => d.opts.label.startsWith('audit:')).length === 1)

  const capped = await run({ args: baseArgs({ maxShards: 1 }), agentFn: mkAgent({ findings: [] }) })
  await t('maxShards bounds the fan-out', () => capped.dispatched.filter(d => d.opts.label.startsWith('audit:')).length === 1)
}

console.log('')
console.log('verification is the floor, and the verifier may correct the disposition:')
{
  const killed = await run({ args: baseArgs(), agentFn: mkAgent({ verdict: { refuted: true, why: 'the doc says 7 already' } }) })
  await t('a refuted finding is dropped', () => killed.findings.length === 0)
  await t('...and recorded with its reason, so the run stays auditable',
    () => killed.refuted.length === 2 && /says 7 already/.test(killed.refuted[0]))
  await t('...and a fully-refuted run is still complete — refutation is a verdict, not a gap',
    () => killed.complete === true)

  const corrected = await run({ args: baseArgs({ perShard: 8 }),
    agentFn: mkAgent({ findings: [F({ sourceOfTruth: 'code', action: 'delete-doc' })],
      verdict: { refuted: false, why: 'intent claim', sourceOfTruth: 'external', action: 'fix-doc', proof: 'PLAT-12' } }) })
  await t('the verifier\'s corrected sourceOfTruth wins over the auditor\'s',
    () => corrected.findings[0].sourceOfTruth === 'external')
  await t('...and its corrected action too — a mis-assigned delete is the expensive one',
    () => corrected.findings[0].action === 'fix-doc')

  const sorted = await run({ args: baseArgs({ perShard: 8 }),
    agentFn: mkAgent({ findings: [F({ kind: 'bloat', claim: 'b' }), F({ kind: 'contradiction', claim: 'c' })] }) })
  await t('findings sort worst-kind first: contradiction before bloat',
    () => sorted.findings[0].kind === 'contradiction')
  await t('every finding carries a stable id — the adjudication gate decides BY id',
    () => sorted.findings.map(f => f.id).join(',') === 'D1,D2')
}

console.log('')
console.log('dedup and consolidation:')
{
  const dup = await run({ args: baseArgs(), agentFn: mkAgent() })   // 2 shards, same finding from each
  await t('the same claim found by two shards is returned once', () => dup.findings.length === 1)
  await t('...but both were verified — the pipeline trades a rare duplicate verifier for not stalling on a barrier',
    () => dup.dispatched.filter(d => d.opts.label.startsWith('verify:')).length === 2)

  await t('consolidation runs when findings survive, and is returned',
    () => dup.consolidated === 'CONSOLIDATED')

  const cd = await run({ args: baseArgs(), agentFn: mkAgent({ consolidatorDies: true }) })
  await t('a dead consolidator is uncovered — cross-document contradictions went unsought',
    () => cd.complete === false && cd.uncovered.some(u => /cross-document/.test(u)))

  const clean = await run({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('nothing survives → no consolidation agent is paid for',
    () => clean.dispatched.filter(d => d.opts.label === 'consolidate').length === 0)
}

console.log('')
console.log('externals are read once, and reach every auditor:')
{
  const r = await run({ args: baseArgs({ perShard: 8, externals: [{ name: 'Confluence', how: 'mcp' }] }),
    agentFn: mkAgent({ findings: [] }) })
  await t('one reader per source, not one per shard', () => r.dispatched.filter(d => d.opts.label.startsWith('external:')).length === 1)
  await t('the digest reaches the auditor as authoritative context',
    () => r.dispatched.filter(d => d.opts.label.startsWith('audit:'))
      .every(d => d.prompt.includes('AUTHORITATIVE: retention is 7 days')))
  await t('the reader is told the source is read-only and must not be reconstructed if unreachable',
    () => r.dispatched.filter(d => d.opts.label.startsWith('external:'))
      .every(d => /READ-ONLY and authoritative/.test(d.prompt) && /do not reconstruct/i.test(d.prompt)))
  await t('externals read are reported by name', () => r.externals.join() === 'Confluence')
}

console.log('')
console.log('stamped output — every line says which run it belongs to:')
{
  const r = await run({ args: baseArgs({ startedAt: '08-15 21:04' }), agentFn: mkAgent({ findings: [] }) })
  await t('every logged line carries the run stamp',
    () => r.logs.length > 0 && r.logs.every(m => m.startsWith('[08-15 21:04] ')))
  const r2 = await run({ args: baseArgs(), agentFn: mkAgent({ findings: [] }) })
  await t('with no stamp supplied, lines are unprefixed — never "[undefined]"',
    () => r2.logs.length > 0 && r2.logs.every(m => !m.startsWith('[')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
})()
