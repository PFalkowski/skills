// Tests for manager.js — run: node tests/workflows/manager.test.js
//
// Runs the real script with stubbed agent/parallel/workflow and asserts on what was dispatched.
// The defect class: the wall (#46). A manager agent inside a Workflow cannot spawn, so every
// follow-up must be run by the script, and each round's manager must be a fresh agent.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '../../workflows', 'manager.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function run ({ args, rounds, workerFn = async () => 'DONE: ok', workflowFn = async () => ({ ok: true }) }) {
  const dispatched = [], logs = [], workflows = []
  let r = 0, active = 0, maxActive = 0
  const agent = async (prompt, opts) => {
    dispatched.push({ prompt, opts })
    if (opts.label.startsWith('manager:')) return rounds[r++] ?? null
    active++; maxActive = Math.max(maxActive, active)
    await new Promise(res => setImmediate(res))
    active--
    return workerFn(prompt, opts)
  }
  const workflow = async (name, a) => { workflows.push({ name, a }); return workflowFn(name, a) }
  const parallel = thunks => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))
  const fn = new Function('args', 'agent', 'parallel', 'workflow', 'phase', 'log',
    `return (async () => { ${SRC} })()`)
  const out = await fn(args, agent, parallel, workflow, () => {}, m => logs.push(m))
  return { out, dispatched, logs, workflows, maxActive }
}

const D = o => ({ mandate: 'M', verdicts: [], dispatches: [], escalations: [], report: 'R', ...o })
const W = (id, o) => ({ id, kind: 'agent', skill: 'fix-pr', brief: 'PRINCIPAL… task ' + id, ...o })
const managers = x => x.dispatched.filter(d => d.opts.label.startsWith('manager:'))
const workers = x => x.dispatched.filter(d => !d.opts.label.startsWith('manager:'))

let pass = 0, fail = 0
const t = async (n, f) => { try { if (await f()) { pass++; console.log('  ok  ' + n) } else { fail++; console.log('FAIL  ' + n) } }
  catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
  const two = await run({ args: { input: 'PR #7 ready', mandate: 'merge=allow' },
    rounds: [D({ dispatches: [W('a'), W('b')] }), D({ verdicts: [{ item: 'PR', verdict: 'APPROVE', reason: 'r', evidence: 'e' }] })] })
  await t('each round is a new manager agent', () => managers(two).length === 2)
  await t('the manager is told not to relaunch the workflow and not to spawn',
    () => managers(two).every(m => /do not launch the workflow again/.test(m.prompt) && /Do not spawn/.test(m.prompt)))
  await t('the script runs one worker per dispatch', () => workers(two).length === 2)
  await t('workers are told not to spawn', () => workers(two).every(w => /Do not spawn/.test(w.prompt)))
  await t('worker results reach the next round', () => /DONE: ok/.test(managers(two)[1].prompt))
  await t('stops when the manager returns no dispatches', () => two.out.rounds === 2 && two.out.notRun.length === 0)
  await t('verdicts from every round are returned', () => two.out.verdicts.length === 1)

  const dead = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [W('a')] }), D()], workerFn: async () => null })
  await t('a dead worker reaches the manager as an error, not as done',
    () => /worker died/.test(managers(dead)[1].prompt))

  const capped = await run({ args: { input: 'x', maxRounds: 2 }, rounds: [D({ dispatches: [W('a')] }), D({ dispatches: [W('b')] })] })
  await t('the round cap reports undispatched work instead of dropping it',
    () => capped.out.notRun.length === 1 && capped.logs.some(l => /round cap/.test(l)) && workers(capped).length === 1)

  const local = await run({ args: { input: 'x', local: true }, rounds: [D({ dispatches: [W('a'), W('b'), W('c')] }), D()] })
  await t('a local session runs one worker at a time', () => local.maxActive === 1)
  const wide = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [W('a'), W('b'), W('c')] }), D()] })
  await t('otherwise workers run in parallel', () => wide.maxActive > 1)

  const wf = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [W('s', { kind: 'workflow', workflow: 'sdlc-workhorse', workflowArgs: { goal: 'g' } })] }), D()] })
  await t('a workflow dispatch runs the named workflow, not an agent',
    () => wf.workflows.length === 1 && wf.workflows[0].name === 'sdlc-workhorse' && workers(wf).length === 0)

  const mdead = await run({ args: { input: 'x' }, rounds: [] })
  await t('a dead manager ends the run with a report saying so', () => /died/.test(mdead.out.report))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
