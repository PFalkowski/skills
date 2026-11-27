// Tests for benchmarks/manager-modes/workflow.js — run: node tests/workflows/manager-modes-benchmark.test.js
//
// The defect class: a grade credited to the wrong arm. Graders see plans under neutral names in
// rotated order, so the script must map every answer back to the arm that wrote the plan, and a
// subject or grader that returned nothing must never read as a pass or a fail.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '../../benchmarks/manager-modes/workflow.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function run ({ args, subjectFn, graderFn }) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return opts.label.startsWith('s|') ? subjectFn(opts.label) : graderFn(prompt, opts.label)
  }
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    try { for (const s of stages) v = await s(v, item, i) } catch { return null }
    return v
  }))
  const fn = new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  return { out: await fn(args, agent, parallel, pipeline, () => {}, () => {}), calls }
}

// Each subject's plan names its own arm, and the grader answers yes only for arm v2's plan,
// so a correct mapping gives c1=1 to v2 and c1=0 to every other arm in every rotation.
const subjectFn = label => ({ actions: [{ tool: 'Agent', what: `plan of ${label.split('|')[2]}` }], message_to_human: '', then: '' })
const plansIn = prompt => JSON.parse(prompt.slice(prompt.indexOf('Plans:\n') + 7))
const graderFn = prompt => ({ plans: plansIn(prompt).map(p => ({ plan: p.plan,
  answers: [{ id: 'c1', yes: /plan of v2/.test(p.actions[0]?.what || ''), quote: 'q' }] })) })
const ARGS = { root: '/state', arms: ['v1', 'v2', 'v3'], cases: ['t01', 't02'], trials: 2,
  files: { v1: ['manager/SKILL.md'], v2: ['manager/SKILL.md', 'workflows/x.js'], v3: ['manager/SKILL.md'] } }

let pass = 0, fail = 0
const t = async (n, f) => { try { if (await f()) { pass++; console.log('  ok  ' + n) } else { fail++; console.log('FAIL  ' + n) } }
  catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
  const x = await run({ args: ARGS, subjectFn, graderFn })
  const subjects = x.calls.filter(c => c.opts.label.startsWith('s|'))
  const graders = x.calls.filter(c => c.opts.label.startsWith('g|'))
  await t('one subject per arm, case and trial', () => subjects.length === 12 && new Set(subjects.map(s => s.opts.label)).size === 12)
  await t('one grader per case and trial', () => graders.length === 4)
  await t('subjects and graders run on sonnet', () => x.calls.every(c => c.opts.model === 'sonnet'))
  const other = await run({ args: { ...ARGS, model: 'opus' }, subjectFn, graderFn })
  await t('...whatever the args say, because the frozen plan names the model', () => other.calls.every(c => c.opts.model === 'sonnet'))
  await t('a subject is pointed at its own arm and case only',
    () => subjects.every(s => { const [, id, arm] = s.opts.label.split('|')
      return s.prompt.includes(`/state/arms/${arm}/manager`) && s.prompt.includes(`/state/subject/cases/${id}.md`) && !s.prompt.includes('/grader/') }))
  await t('a subject is told which files its copy holds', () => subjects.every(s => s.prompt.includes('workflows/x.js') === (s.opts.label.split('|')[2] === 'v2')))
  await t('a grader never sees an arm label in the plan names', () => graders.every(g => plansIn(g.prompt).every(p => /^p\d$/.test(p.plan))))
  await t('the plan order differs between groups', () => new Set(graders.map(g => plansIn(g.prompt)[0].actions[0].what)).size > 1)
  await t('every answer is credited to the arm that wrote the plan',
    () => x.out.cells.length === 12 && x.out.cells.every(c => c.endsWith(c.split('|')[1] === 'v2' ? 'c1=1' : 'c1=0')))
  await t('a complete run reports nothing missing', () => x.out.missing === 0)

  const dead = await run({ args: ARGS, graderFn, subjectFn: label => label === 's|t01|v3|0' ? null : subjectFn(label) })
  await t('a subject that returned nothing is marked missing, not graded',
    () => dead.out.cells.includes('t01|v3|0|MISSING_SUBJECT') && dead.out.missing === 1)
  await t('...and the other arms of its group keep their own grades',
    () => dead.out.cells.includes('t01|v2|0|c1=1') && dead.out.cells.includes('t01|v1|0|c1=0'))

  const blank = await run({ args: ARGS, graderFn, subjectFn: label => label === 's|t01|v3|0' ? { actions: [], message_to_human: ' ', then: '' } : subjectFn(label) })
  await t('an empty plan is marked missing, not graded as a plan',
    () => blank.out.cells.includes('t01|v3|0|MISSING_SUBJECT') && blank.out.missing === 1)
  const silent = await run({ args: ARGS, graderFn, subjectFn: label => ({ actions: [], message_to_human: 'The skill gives me nothing to do.', then: '' }) })
  await t('a plan with no actions but a message is graded', () => silent.out.missing === 0)
  const sly = await run({ args: ARGS, graderFn, subjectFn: label => ({ ...subjectFn(label), plan: 'p1' }) })
  await t('a plan cannot rename itself to another plan', () => sly.out.missing === 0 &&
    sly.out.cells.every(c => c.endsWith(c.split('|')[1] === 'v2' ? 'c1=1' : 'c1=0')))

  const noGrade = await run({ args: ARGS, subjectFn, graderFn: (prompt, label) => label === 'g|t02|1' ? null : graderFn(prompt) })
  await t('a grader that returned nothing marks its whole group missing',
    () => noGrade.out.cells.filter(c => c.endsWith('MISSING_GRADE')).length === 3 && noGrade.out.missing === 3)
  const partial = await run({ args: ARGS, subjectFn, graderFn: prompt => ({ plans: graderFn(prompt).plans.slice(1) }) })
  await t('a plan the grader skipped is marked missing', () => partial.out.missing === 4)

  const examples = { d01: { good: subjectFn('s|d01|v2|0'), bad: subjectFn('s|d01|v1|0'), alt: subjectFn('s|d01|v2|0') } }
  const ex = await run({ args: { root: '/state', arms: ['good', 'bad', 'alt'], cases: ['d01'], examples }, subjectFn, graderFn })
  await t('the grader check grades the example plans and runs no subject',
    () => ex.calls.length === 1 && ex.out.cells.join() === 'd01|good|0|c1=1,d01|bad|0|c1=0,d01|alt|0|c1=1')

  const local = await run({ args: { ...ARGS, local: true }, subjectFn, graderFn }).then(() => false, e => /normal session/.test(e.message))
  await t('a local-model session is refused, because the run fans out', () => local)
  const str = await run({ args: JSON.stringify(ARGS), subjectFn, graderFn })
  await t('args delivered as a JSON string are parsed', () => str.out.cells.length === 12)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
