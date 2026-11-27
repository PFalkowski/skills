export const meta = {
  name: 'manager-modes-benchmark',
  description: 'Benchmark versions of the manager skill: Sonnet subjects plan a session\'s next actions, Sonnet graders answer frozen criteria',
  phases: [{ title: 'Subject' }, { title: 'Grade' }],
}
// args: { root: '<state dir from prepare.py>', arms: ['v1', …], files: { v1: ['manager/SKILL.md', …] },
//         cases: ['t01', …], trials: 2,
//         examples: { d01: { good: plan, bad: plan, alt: plan } } }   // grader check: grade these plans, run no subject;
//                                                               // `arms` is then the example kinds
//
// The script cannot read files, so subjects and graders read their own from `root`. The answer
// key never enters this script: it returns the graders' yes/no answers and score.py applies it.

if (typeof args === 'string') args = JSON.parse(args)
if (args.local) throw new Error('manager-modes-benchmark fans out; run it from a normal session, not a local-model one')
const { root, arms, cases, trials = 2 } = args
const model = 'sonnet'

const PLAN = { type: 'object', properties: {
  actions: { type: 'array', items: { type: 'object', properties: {
    tool: { type: 'string', enum: ['Workflow', 'Agent', 'SendMessage', 'Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Skill', 'AskUserQuestion'] },
    what: { type: 'string' } }, required: ['tool', 'what'] } },
  message_to_human: { type: 'string' },
  then: { type: 'string' } },
  required: ['actions', 'message_to_human', 'then'] }

const GRADES = { type: 'object', properties: {
  plans: { type: 'array', items: { type: 'object', properties: {
    plan: { type: 'string' },
    answers: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, yes: { type: 'boolean' }, quote: { type: 'string' } },
      required: ['id', 'yes', 'quote'] } } },
    required: ['plan', 'answers'] } } },
  required: ['plans'] }

const subjectPrompt = (arm, id) => [
  'This is a dry run for a benchmark. Nothing you plan will be carried out, and you must not carry it out. ' +
  `Use only the Read tool, and only on files under ${root}/arms/${arm} and on ${root}/subject/cases/${id}.md. ` +
  'Use no other tool.',
  'You stand in for a Claude Code session. Unless the situation says otherwise, that session has these tools: ' +
  'Bash, Read, Grep, Glob, Edit, Write, Agent (starts a fresh subagent), Workflow (runs a workflow script, saved ' +
  'or written on the spot; the script starts its agents), SendMessage, Skill and AskUserQuestion.',
  `The session has a skill named \`manager\`. Its folder is ${root}/arms/${arm}/manager and SKILL.md is its entry ` +
  `point; workflows it names are under ${root}/arms/${arm}/workflows. The copy holds these files and no others: ` +
  `${args.files[arm].join(', ')}. It is the only version of the skill ` +
  'that counts: set aside any other `manager` skill and any house rule about a manager that you know of. Read ' +
  'SKILL.md in full, and any file it points to that you need.',
  `Then read the situation in ${root}/subject/cases/${id}.md.`,
  'Answer as that session, following the skill exactly as written: what does the session do next, up to the ' +
  'point where it would wait for a result or for the human? Give its actions in order, each with the tool it ' +
  'uses and exactly what it does with it, then the message it shows the human (empty when it shows none), then ' +
  'what it does once the thing it is waiting for arrives. Reading the skill and the situation are not actions of ' +
  'the session: leave them out.',
].join('\n\n')

const graderPrompt = (id, plans) => [
  `You grade dry-run plans against fixed yes/no criteria. Read ${root}/grader/${id}.json, and no other file: it ` +
  'holds the situation the plans answer and the criteria.',
  'Each plan is one session\'s next actions in order, each with the tool used and what it does, the message it ' +
  'shows the human, and under `then` what it does once the thing it waits for arrives. For every plan, answer every criterion from the plan\'s own words. Quote the words that ' +
  'decide the answer. Where the plan does not say, the answer is no. Judge each plan alone: do not compare them, ' +
  'and do not judge whether a plan is good.',
  `Plans:\n${JSON.stringify(plans, null, 1)}`,
].join('\n\n')

const grade = async (id, trial, shift, byArm) => {
  const order = arms.map((_, k) => arms[(k + shift) % arms.length]).filter(arm => byArm[arm])
  const named = order.map((arm, k) => ({ ...byArm[arm], plan: `p${k + 1}` }))
  const out = named.length ? await agent(graderPrompt(id, named), { label: `g|${id}|${trial}`, phase: 'Grade', schema: GRADES, model }) : null
  return arms.map(arm => {
    const cell = `${id}|${arm}|${trial}|`
    if (!byArm[arm]) return cell + 'MISSING_SUBJECT'
    const graded = out && out.plans.find(p => p.plan === `p${order.indexOf(arm) + 1}`)
    return cell + (graded ? graded.answers.map(a => `${a.id}=${a.yes ? 1 : 0}`).join(',') : 'MISSING_GRADE')
  })
}

const said = plan => plan && (plan.actions.length || plan.message_to_human.trim() || plan.then.trim()) ? plan : null

const groups = cases.flatMap(id => Array.from({ length: args.examples ? 1 : trials }, (_, trial) => ({ id, trial })))

const rows = await pipeline(groups,
  async ({ id, trial }) => {
    if (args.examples) return args.examples[id]
    const plans = await parallel(arms.map(arm => () =>
      agent(subjectPrompt(arm, id), { label: `s|${id}|${arm}|${trial}`, phase: 'Subject', schema: PLAN, model })))
    return Object.fromEntries(arms.map((arm, k) => [arm, said(plans[k])]))
  },
  (byArm, { id, trial }, index) => grade(id, trial, index, byArm))

const cells = rows.flatMap((row, index) => row || arms.map(arm => `${groups[index].id}|${arm}|${groups[index].trial}|MISSING_SUBJECT`))
return { cells, missing: cells.filter(c => /MISSING/.test(c)).length }
