export const meta = {
  name: 'manager',
  description: 'Run the manager as a fresh agent that did not write the work; the script dispatches its follow-ups',
  phases: [{ title: 'Decide' }, { title: 'Dispatch' }],
}
// args: { input: '<pasted report | run <skill> <task> | what arrived since the last watch pass>',
//         mandate: 'goal="…" merge=allow …',          // the invocation's keys, verbatim; '' for defaults
//         autonomy: 'autonomous' | '',               // the session's CLAUDE_AUTONOMY
//         local: false,                              // CLAUDE_LOCAL=1: one agent at a time
//         maxRounds: 8, tier: 'opus' }
//
// THE WALL (#46): an agent() inside a Workflow has no Agent or Workflow tool, and when told to
// spawn it role-plays the subagent instead of failing. So the manager agent never dispatches:
// it returns dispatch requests, and this script runs them and hands the results to the next
// round's manager. Each round's manager is a fresh agent that did not write the work it judges.

const VERDICTS = ['APPROVE', 'REDIRECT', 'DEFER', 'ESCALATE', 'VETO']
const DECISION = { type: 'object', properties: {
  mandate: { type: 'string' },
  verdicts: { type: 'array', items: { type: 'object', properties: {
    item: { type: 'string' }, verdict: { type: 'string', enum: VERDICTS },
    reason: { type: 'string' }, evidence: { type: 'string' } },
    required: ['item', 'verdict', 'reason', 'evidence'] } },
  dispatches: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, kind: { type: 'string', enum: ['agent', 'workflow'] },
    skill: { type: 'string' }, brief: { type: 'string' },
    workflow: { type: 'string' }, workflowArgs: { type: 'object' },
    model: { type: 'string' }, effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
    worktree: { type: 'boolean' } },
    required: ['id', 'kind', 'skill', 'brief'] } },
  escalations: { type: 'array', items: { type: 'object', properties: {
    what: { type: 'string' }, recommendation: { type: 'string' } },
    required: ['what', 'recommendation'] } },
  report: { type: 'string' } },
  required: ['mandate', 'verdicts', 'dispatches', 'escalations', 'report'] }

const NO_SPAWN = 'You run inside a Workflow: you have no Agent or Workflow tool. Do not spawn, ' +
  'delegate or simulate subagents; do the work yourself or list it under OPEN.'

const managerPrompt = (round, history) => [
  'Invoke the `manager` skill and act as the manager it describes. You are the manager agent ' +
  'inside the `manager` workflow: do not launch the workflow again; run the loop yourself.',
  `Mandate keys: ${args.mandate || '(none: use the defaults)'}. CLAUDE_AUTONOMY=${args.autonomy || '(unset)'}.`,
  `Input:\n${args.input}`,
  history.length ? `Earlier rounds (mandate paragraph, verdicts, and what each dispatch returned):\n${JSON.stringify(history, null, 1)}` : '',
  `This is round ${round} of at most ${args.maxRounds || 8}.`,
  'Verify, decide and act (post, file, merge) yourself as the skill says. ' + NO_SPAWN,
  'Return every legwork dispatch as an entry in `dispatches` instead of running it: the script ' +
  'runs each one in a fresh agent (kind=agent, brief = the principal brief from manager/PRINCIPAL.md ' +
  'filled for this run, plus the task) or as a named workflow (kind=workflow, e.g. sdlc-workhorse, ' +
  'nights-watch-grill), and gives you the results next round. Return no dispatches when nothing ' +
  'more needs doing. Every escalation carries a recommendation.',
].filter(Boolean).join('\n\n')

const runDispatch = async (d) => {
  if (d.kind === 'workflow') {
    try { return await workflow(d.workflow || d.skill, d.workflowArgs || {}) }
    catch (e) { return { error: `workflow ${d.workflow || d.skill} failed: ${e.message}` } }
  }
  const out = await agent(`Use the \`${d.skill}\` skill.\n\n${d.brief}\n\n${NO_SPAWN}`, {
    label: `${d.skill}:${d.id}`, phase: 'Dispatch', model: d.model, effort: d.effort,
    isolation: d.worktree ? 'worktree' : undefined })
  return out === null ? { error: 'worker died or was skipped; nothing it claims is done' } : out
}

const maxRounds = args.maxRounds || 8
const history = [], verdicts = [], escalations = []
let mandate = '', report = '', open = []

for (let round = 1; round <= maxRounds; round++) {
  phase('Decide')
  const d = await agent(managerPrompt(round, history), {
    label: `manager:${round}`, phase: 'Decide', schema: DECISION, model: args.tier || 'opus' })
  if (d === null) { report = `manager agent died in round ${round}`; open = []; break }
  mandate = mandate || d.mandate
  verdicts.push(...d.verdicts)
  escalations.push(...d.escalations)
  report = d.report
  open = d.dispatches
  if (!d.dispatches.length) break
  if (round === maxRounds) { log(`round cap ${maxRounds} hit; ${open.length} dispatch(es) not run`); break }

  phase('Dispatch')
  const results = []
  if (args.local) for (const x of d.dispatches) results.push(await runDispatch(x))
  else results.push(...await parallel(d.dispatches.map(x => () => runDispatch(x))))
  history.push({ round, mandate: d.mandate, verdicts: d.verdicts,
    results: d.dispatches.map((x, i) => ({ id: x.id, skill: x.skill, result: results[i] ?? { error: 'no result' } })) })
}

return { mandate, verdicts, escalations, report, notRun: open, rounds: history.length + 1 }
