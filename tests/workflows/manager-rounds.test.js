// Tests for manager-rounds.js — run: node tests/workflows/manager-rounds.test.js
//
// Runs the real script with stubbed agent/parallel/workflow and asserts on what was dispatched
// and returned. Two defect classes:
//   1. The wall (#46). A manager agent inside a Workflow cannot spawn, so every follow-up must
//      be run by the script, and each round's manager must be a fresh agent.
//   2. Silence is not a pass. A manager that dies, throws or runs out of rounds leaves a result
//      that looks finished. Only a manager round that asks for no more work makes `complete` true.
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '../../workflows', 'manager-rounds.js'), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?^\}$/m, '')

async function run ({ args, rounds, workerFn = async () => 'DONE: ok', workflowFn = async () => ({ ok: true }) }) {
  const dispatched = [], logs = [], workflows = []
  let r = 0, active = 0, maxActive = 0
  const agent = async (prompt, opts) => {
    dispatched.push({ prompt, opts })
    if (opts.label.startsWith('manager:')) {
      const next = rounds[r++] ?? null
      if (next instanceof Error) throw next
      return next
    }
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
const V = item => ({ item, verdict: 'APPROVE', reason: 'r', evidence: 'e' })
const E = what => ({ what, recommendation: 'do it' })
const WF = W('s', { kind: 'workflow', workflow: 'sdlc-workhorse', workflowArgs: { goal: 'g' } })
const managers = x => x.dispatched.filter(d => d.opts.label.startsWith('manager:'))
const workers = x => x.dispatched.filter(d => !d.opts.label.startsWith('manager:'))

let pass = 0, fail = 0
const t = async (n, f) => { try { if (await f()) { pass++; console.log('  ok  ' + n) } else { fail++; console.log('FAIL  ' + n) } }
  catch (e) { fail++; console.log('FAIL  ' + n + ': ' + e.message) } }

;(async () => {
  const two = await run({ args: { input: 'PR #7 ready', mandate: 'merge=allow' }, rounds: [
    D({ verdicts: [V('first')], escalations: [E('x')], dispatches: [W('a'), W('b')] }),
    D({ verdicts: [V('second')], escalations: [E('y')] })] })
  await t('each round is a new manager agent', () => managers(two).length === 2)
  await t('the manager is given the input', () => managers(two).every(m => m.prompt.includes('PR #7 ready')))
  await t('the manager is given the mandate keys', () => managers(two).every(m => m.prompt.includes('merge=allow')))
  await t('the manager is told not to relaunch the workflow and not to spawn',
    () => managers(two).every(m => /do not launch the workflow again/.test(m.prompt) && /Do not spawn/.test(m.prompt)))
  await t('the script runs one worker per dispatch', () => workers(two).length === 2)
  await t('workers are told not to spawn', () => workers(two).every(w => /Do not spawn/.test(w.prompt)))
  await t('worker results reach the next round', () => /DONE: ok/.test(managers(two)[1].prompt))
  await t('stops when the manager returns no dispatches', () => two.out.rounds === 2 && two.out.notRun.length === 0)
  await t('verdicts from every round are returned', () => two.out.verdicts.map(v => v.item).join() === 'first,second')
  await t('escalations from every round are returned', () => two.out.escalations.map(e => e.what).join() === 'x,y')
  await t('a run whose last manager asks for no more work is complete',
    () => two.out.complete === true && two.out.uncovered.length === 0 && two.out.unjudged.length === 0)

  const dead = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [W('a')] }), D()], workerFn: async () => null })
  await t('a dead worker reaches the manager as an error, not as done',
    () => /worker died/.test(managers(dead)[1].prompt))
  await t('a dead worker the next manager has judged leaves the run complete', () => dead.out.complete === true)

  const boom = await run({ args: { input: 'x', local: true }, rounds: [D({ dispatches: [W('a')] }), D()],
    workerFn: async () => { throw new Error('boom') } })
  await t('a worker that throws reaches the manager as an error instead of ending the run',
    () => /agent fix-pr failed: boom/.test(managers(boom)[1].prompt))

  const capped = await run({ args: { input: 'x', maxRounds: 2 }, rounds: [D({ dispatches: [W('a')] }), D({ dispatches: [W('b')] })] })
  await t('the round cap reports undispatched work instead of dropping it',
    () => capped.out.notRun.length === 1 && capped.logs.some(l => /round cap/.test(l)) && workers(capped).length === 1)
  await t('a run stopped at the round cap is not complete',
    () => capped.out.complete === false && capped.out.uncovered.some(u => /round cap/.test(u)))
  const capStr = await run({ args: { input: 'x', maxRounds: '2' }, rounds: [D({ dispatches: [W('a')] }), D({ dispatches: [W('b')] })] })
  await t('a round cap passed as a string still caps', () => workers(capStr).length === 1 && capStr.out.notRun.length === 1)

  const local = await run({ args: { input: 'x', local: true }, rounds: [D({ dispatches: [W('a'), W('b'), W('c')] }), D()] })
  await t('a local session runs one worker at a time', () => local.maxActive === 1)
  const wide = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [W('a'), W('b'), W('c')] }), D()] })
  await t('otherwise workers run in parallel', () => wide.maxActive > 1)

  const wf = await run({ args: { input: 'x' }, rounds: [D({ dispatches: [WF] }), D()] })
  await t('a workflow dispatch runs the named workflow, not an agent',
    () => wf.workflows.length === 1 && wf.workflows[0].name === 'sdlc-workhorse' && workers(wf).length === 0)
  const wfFail = await run({ args: { input: 'x', local: true }, rounds: [D({ dispatches: [WF] }), D()],
    workflowFn: async () => { throw new Error('unknown workflow') } })
  await t('a failed workflow dispatch reaches the manager as an error instead of ending the run',
    () => /workflow sdlc-workhorse failed: unknown workflow/.test(managers(wfFail)[1].prompt))

  const mdead = await run({ args: { input: 'x' }, rounds: [] })
  await t('a manager that returns nothing leaves the run incomplete, and says its actions are unknown',
    () => mdead.out.complete === false && /round 1's manager returned nothing/.test(mdead.out.uncovered[0]) &&
      /unknown/.test(mdead.out.uncovered[0]) && mdead.logs.some(l => /returned nothing/.test(l)))

  const mdead2 = await run({ args: { input: 'x' }, rounds: [D({ verdicts: [V('first')], dispatches: [W('a')], report: 'R1' })] })
  await t('a manager that dies in a later round hands back the worker results it never judged',
    () => mdead2.out.complete === false && mdead2.out.unjudged.length === 1 &&
      mdead2.out.unjudged[0].id === 'a' && mdead2.out.unjudged[0].result === 'DONE: ok')
  await t('...and keeps the earlier rounds\' verdicts and report',
    () => mdead2.out.verdicts.length === 1 && mdead2.out.report === 'R1')

  const mthrow = await run({ args: { input: 'x' }, rounds: [D({ verdicts: [V('first')], dispatches: [W('a')] }), new Error('budget spent')] })
  await t('a manager that throws ends the run incomplete instead of losing the earlier verdicts',
    () => mthrow.out.complete === false && mthrow.out.verdicts.length === 1 &&
      mthrow.out.uncovered.some(u => /round 2's manager threw: budget spent/.test(u)))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
