export const meta = {
  name: 'sdlc-workhorse',
  description: 'The full SDLC as an executable pipeline: baseline → spec → grill → plan → adversarial review → slice → TDD fanout → grill the diff → document → retrospective. Autonomous, evidence-gated, stops at irreversible lines.',
  whenToUse: 'A load-bearing change that deserves the full lifecycle, run unattended. Dispatched by the sdlc-workhorse skill, which gathers the goal and settings. The attended, human-at-every-gate variant is the sdlc-old-fashioned skill.',
  phases: [
    { title: 'Baseline', detail: 'catalogue the repo pitfalls and prove the guardrails are green before touching anything' },
    { title: 'Spec', detail: 'problem, goal, scope, non-goals, success criteria' },
    { title: 'Grill', detail: 'a fresh agent attacks the spec until every load-bearing ambiguity is resolved or deferred' },
    { title: 'Plan', detail: 'approach, interfaces, failure modes, alternatives rejected, test strategy — no code' },
    { title: 'Plan review', detail: 'a fresh agent that never saw the planner grills the design; refuted claims send it back' },
    { title: 'Slice', detail: 'approved plan broken into independently shippable tracer bullets' },
    { title: 'Build', detail: 'per slice: RED verified by a second agent, then GREEN + refactor' },
    { title: 'Review', detail: 'fresh-agent grill of each diff, findings adversarially verified' },
    { title: 'Document', detail: 'README / ADR / changelog shipped with the code, not later' },
    { title: 'Retrospective', detail: 'curate durable lessons, file what needs a human, report the merge-ready state' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. The skill gathers these; everything here has a defensible default
// except the goal itself.
// ---------------------------------------------------------------------------
// Some hosts deliver `args` as an unparsed JSON string rather than the object the contract
// promises; this is a no-op when args already arrives parsed.
if (typeof args === 'string') args = JSON.parse(args)
const cfg = args || {}
if (typeof cfg.goal !== 'string' || !cfg.goal.trim()) {
  throw new Error('sdlc-workhorse: args.goal is required — the change to build, in enough detail to specify.')
}

const backlogPath = cfg.backlogPath || 'prompts/sdlc-backlog.md'
const chronicleDir = cfg.chronicleDir || '.sdlc/chronicles'
const libraryIndex = cfg.libraryIndex || null          // nights-watch Library, if the repo keeps one
const maxGrillRounds = cfg.maxGrillRounds ?? 3
const maxPlanRounds = cfg.maxPlanRounds ?? 2
const maxSlices = cfg.maxSlices ?? 12
// Refuters are the dominant cost of a run — 93 of 103 agents on a measured P3 fix, because every
// gate refuted every extracted claim with three lenses and each plan round re-proved the last
// round's claims from scratch. The answer is NOT fewer lenses: three perspective-diverse attacks
// is what makes a verdict worth having, and thinning it degrades the check on the claims that
// matter most. It is to spend them on the claims the artifact actually rests on. An extractor
// handed a verbose spec will happily call fifteen things load-bearing; this bounds how many get
// the full triple, most-blast-radius first, and says out loud what it dropped.
const maxClaimsPerGate = cfg.maxClaimsPerGate ?? 5
// code-review-grill's two ALWAYS-ASK gates, pre-answered — there is no human to ask.
const reviewStance = cfg.reviewStance || 'single'
const reviewConcerns = cfg.reviewConcerns || ['correctness', 'documentation']
const reserve = cfg.reserve ?? 60000                    // output tokens held back per slice
// NOT `parallel` — that is the Workflow-injected fan-out helper this script calls in five
// places. A top-level `const parallel = <number>` shadows it, and every one of those calls
// dies (TypeError at runtime, or SyntaxError if the runtime injects helpers as parameters).
const parallelSlices = cfg.parallel ?? 1                // slices in flight; 1 = one branch, one PR
const maxWorkers = cfg.maxWorkers ?? 3

// Lowest sufficient tier per phase — never default a worker to the session tier.
const tiers = Object.assign({
  baseline: 'haiku',
  spec: 'opus',        // premise gate — floored, see below
  grill: 'opus',       // premise gate — floored, see below
  plan: 'opus',        // a wrong design costs more than the tokens
  planReview: 'opus',
  slice: 'sonnet',
  build: 'sonnet',
  review: 'sonnet',
  verify: 'haiku',     // refuters are many and cheap
  document: 'sonnet',
  retro: 'sonnet',
}, cfg.tiers || {})

// ---------------------------------------------------------------------------
// The premise gates are FLOORED, not defaulted. These four phases are where
// "what correct means" is established, and every later phase inherits their
// output as fact: the slicer slices against the plan, the RED test asserts the
// acceptance criteria, the reviewer judges the diff against the spec. A cheap
// premise is therefore not a cheap run — it is a wrong run that costs full
// price, and it fails in the one direction nobody catches, because every
// downstream gate is busy checking conformance to a premise nobody rechecked.
//
// `Object.assign` above would let `cfg.tiers: { grill: 'haiku' }` silently buy
// exactly that. So the floor is applied AFTER the merge and clamps upward only:
// a caller may raise a premise phase, never lower it. An unrecognised tier name
// is clamped too — an unknown string is not evidence of a capable model.
// ---------------------------------------------------------------------------
const TIER_RANK = { haiku: 0, sonnet: 1, fable: 2, opus: 2 }
const PREMISE_PHASES = ['spec', 'grill', 'plan', 'planReview']
const PREMISE_FLOOR = 'opus'
const tiersFloored = []
for (const p of PREMISE_PHASES) {
  const rank = TIER_RANK[tiers[p]]
  if (rank === undefined || rank < TIER_RANK[PREMISE_FLOOR]) {
    if (tiers[p] !== PREMISE_FLOOR) tiersFloored.push(`${p}: ${tiers[p]} → ${PREMISE_FLOOR}`)
    tiers[p] = PREMISE_FLOOR
  }
}
// Say it. A clamp the caller cannot see is a config that lies back to them: they
// asked for a cheap run, got a correct one, and will size the next budget from a
// number they never learned the reason for.
if (tiersFloored.length) {
  log(`premise gates floored to ${PREMISE_FLOOR} (a premise phase may be raised, never lowered): ` +
      tiersFloored.join(', '))
}

const chronicle = (name) => `${chronicleDir}/${name}.md`
const CHRONICLE_RULE = (path) =>
  `Keep a chronicle at ${path} (absolute-safe path, outside any worktree you create): append a field note THE MOMENT ` +
  `you learn something — a convention discovered, a trap hit, a command that finally worked, an assumption that proved ` +
  `false — not at the end. It must survive you crashing.`
const LIBRARY_RULE = libraryIndex
  ? `Before working, read the Library index at ${libraryIndex} and open ONLY the entries relevant to this task. Recall stays lean.`
  : ''
const BACKLOG_RULE =
  `This run is AUTONOMOUS. A question you cannot answer does NOT stop the run: if it is REVERSIBLE, pick the sensible ` +
  `default, log the choice and its rationale to ${backlogPath}, and carry on. If it is IRREVERSIBLE (schema/data ` +
  `migration, publish, spend, protected-branch merge, anything outward-facing), do NOT do it — record it as a blocker ` +
  `and return. Out-of-scope work you discover is filed to ${backlogPath} on the spot, never silently absorbed.`

// The premise phases (spec, grill, plan) do not merely *permit* fact-checking —
// they are where "what correct means" is fixed, so grounding is the work rather
// than a diligence step available to a careful agent. The refuters downstream
// are a net, not a substitute: they see only the claims an extractor pulled out
// of a finished artifact, so an assumption the author never wrote down is
// invisible to them. It has to be checked by the agent making it, at the moment
// it is made.
const FACT_CHECK_RULE =
  `MANDATORY — run the "fact-check" skill on every load-bearing claim you are about to write down, BEFORE you write ` +
  `it. This is not optional diligence and not a step you may judge unnecessary: a claim that reaches the artifact ` +
  `unchecked has already contaminated every phase after this one, because they read your output as established fact. ` +
  `Decompose each claim into independently verifiable sub-claims and prove each with the strongest evidence ` +
  `available — executable → run it and paste the ACTUAL output; about this codebase → cite the exact path:line; ` +
  `documentable → two or more independent authoritative sources. UNPROVABLE = FALSE: a claim you cannot ground does ` +
  `not go in hedged ("likely", "should be", "appears to"), it does not go in at all. State plainly what you could ` +
  `not establish and treat it as an open question. Discovering mid-check that your premise is WRONG is a SUCCESS of ` +
  `this process, not a setback — say so and change the artifact.`

// Several skills this workflow composes are INTERACTIVE by design — grill-me and
// grill-with-docs interview a user; code-review-grill has two ALWAYS-ASK gates.
// Invoked from an autonomous worker they would stall or improvise past their own
// rules, so every prompt that reaches for one says plainly that no human exists
// and how to satisfy the gate instead. Skipping the skill is NOT the answer.
const NO_HUMAN_RULE =
  `There is NO human attached to this run. A skill you invoke that would ask the user something is satisfied by ` +
  `EXPLORING instead — grill-me's own rule: if the codebase can answer it, explore rather than ask. Settle it from ` +
  `the repo, the docs, or a runnable experiment. What genuinely needs a human is recorded, never asked: reversible → ` +
  `pick the sensible default and log it to ${backlogPath}; irreversible → return it as a blocker. Do not skip a ` +
  `skill merely because you cannot ask its questions.`

// ---------------------------------------------------------------------------
// Schemas. A gate that returns prose is a gate a model can talk its way past.
// ---------------------------------------------------------------------------
const CLAIM_LIST = {
  type: 'object',
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      description: 'Only LOAD-BEARING claims — the ones this artifact collapses without. Empty array is valid and honest.',
      items: {
        type: 'object',
        required: ['claim', 'whyLoadBearing', 'blastRadius'],
        properties: {
          claim: { type: 'string' },
          whyLoadBearing: { type: 'string' },
          // Ranks the fan-out when there are more claims than budget. 'total' = the artifact is
          // void if this is false; 'major' = a section has to be redesigned; 'moderate' = a
          // detail changes. Asked as an explicit field rather than inferred from list order,
          // because ordering is the first thing a model drops under a long extraction.
          blastRadius: { type: 'string', enum: ['total', 'major', 'moderate'] },
        },
      },
    },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['status', 'evidence'],
  properties: {
    status: { type: 'string', enum: ['refuted', 'confirmed', 'unverifiable'] },
    evidence: {
      type: 'string',
      description: 'A runnable snippet AND its actual output, a path:line in this repo, or an authoritative deep link. Your confidence is not evidence.',
    },
  },
}

const BASELINE_SCHEMA = {
  type: 'object',
  required: ['green', 'checks', 'pitfalls', 'missingGuardrails'],
  properties: {
    green: { type: 'boolean', description: 'Did every check the repo already has pass, right now, before any change?' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'passed', 'output'],
        properties: {
          command: { type: 'string' },
          passed: { type: 'boolean' },
          output: { type: 'string', description: 'The real tail of the real run. Not a summary.' },
        },
      },
    },
    pitfalls: { type: 'array', items: { type: 'string' }, description: 'Hard-won rules from LESSONS-LEARNED / ADRs / README / CONTRIBUTING / CLAUDE.md.' },
    missingGuardrails: { type: 'array', items: { type: 'string' }, description: 'Guardrails this change needs that the repo lacks (no linter, no CI test run, no integration tests).' },
  },
}

const SPEC_SCHEMA = {
  type: 'object',
  required: ['problem', 'goal', 'scope', 'nonGoals', 'successCriteria'],
  properties: {
    problem: { type: 'string' },
    goal: { type: 'string' },
    scope: { type: 'array', items: { type: 'string' } },
    nonGoals: { type: 'array', items: { type: 'string' }, description: 'What this deliberately does NOT do. A spec without non-goals has no edges.' },
    successCriteria: { type: 'array', items: { type: 'string' }, description: 'Observable and checkable. "Works well" is not a criterion.' },
    specPath: { type: 'string', description: 'Where the written spec was saved in the repo.' },
  },
}

const GRILL_SCHEMA = {
  type: 'object',
  required: ['holes', 'verdict'],
  properties: {
    verdict: { type: 'string', enum: ['sharp', 'needs-another-round'] },
    holes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question', 'severity', 'resolution'],
        properties: {
          question: { type: 'string' },
          severity: { type: 'string', enum: ['load-bearing', 'minor'] },
          resolution: { type: 'string', enum: ['answered', 'deferred-to-backlog', 'unresolved'] },
          answer: { type: 'string' },
        },
      },
    },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['approach', 'components', 'failureModes', 'alternativesRejected', 'testStrategy'],
  properties: {
    approach: { type: 'string' },
    components: { type: 'array', items: { type: 'string' }, description: 'Key components and interfaces; data and control flow.' },
    failureModes: { type: 'array', items: { type: 'string' } },
    alternativesRejected: {
      type: 'array', minItems: 1,
      description: 'A plan with no rejected alternative was not designed, it was assumed.',
      items: {
        type: 'object',
        required: ['alternative', 'whyRejected'],
        properties: { alternative: { type: 'string' }, whyRejected: { type: 'string' } },
      },
    },
    testStrategy: { type: 'string' },
    planPath: { type: 'string' },
  },
}

const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['approved', 'revise', 'reopens-requirements'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['concern', 'category', 'mustFix'],
        properties: {
          concern: { type: 'string' },
          category: { type: 'string', enum: ['hidden-coupling', 'unhandled-failure', 'wrong-abstraction', 'cheaper-path', 'does-not-satisfy-spec', 'other'] },
          mustFix: { type: 'boolean' },
        },
      },
    },
  },
}

const SLICES_SCHEMA = {
  type: 'object',
  required: ['slices'],
  properties: {
    slices: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'acceptanceCriterion', 'tier'],
        properties: {
          id: { type: 'string', description: 'Short kebab-case id, unique in this run.' },
          title: { type: 'string' },
          acceptanceCriterion: { type: 'string', description: 'The single observable behaviour this slice adds. One test can encode it.' },
          tier: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], description: 'Lowest tier that can actually do this slice.' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const RED_SCHEMA = {
  type: 'object',
  required: ['testPath', 'testCommand', 'output', 'failedForTheRightReason'],
  properties: {
    testPath: { type: 'string' },
    testCommand: { type: 'string' },
    output: { type: 'string', description: 'The ACTUAL output of running the test. Paste it, do not describe it.' },
    failedForTheRightReason: { type: 'boolean', description: 'Did it fail on the asserted behaviour — not on a typo, import error, or missing fixture?' },
  },
}

const GREEN_SCHEMA = {
  type: 'object',
  required: ['passed', 'output', 'summary'],
  properties: {
    passed: { type: 'boolean' },
    output: { type: 'string', description: 'Actual output of the test run after implementing.' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'failureScenario', 'severity'],
        properties: {
          summary: { type: 'string' },
          failureScenario: { type: 'string', description: 'Concrete inputs/state → wrong output/crash. No scenario means no finding.' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          mechanical: { type: 'boolean', description: 'Can it be fixed without a judgment call?' },
        },
      },
    },
  },
}

const RETRO_SCHEMA = {
  type: 'object',
  required: ['lessons', 'reflection'],
  properties: {
    reflection: { type: 'string', description: 'What slowed this run down, what was ambiguous, what broke.' },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lesson', 'type', 'action'],
        properties: {
          lesson: { type: 'string' },
          type: { type: 'string', enum: ['convention', 'gotcha', 'calibration', 'decision', 'tooling', 'process'] },
          action: { type: 'string', enum: ['evolved-now', 'filed-for-human', 'flagged-blocker'] },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Truth before all. Every load-bearing claim at a gate is decomposed and
// attacked by perspective-diverse refuters. Unprovable is treated as FALSE —
// that is the whole point, and it is arithmetic here rather than a good
// intention. Discovering a premise is wrong is a success of the process.
// ---------------------------------------------------------------------------
const LENSES = [
  'correctness — is the claim simply, factually wrong?',
  'evidence — is it asserted rather than shown? Demand the snippet, the path:line, or the source.',
  'reproduction — if you actually did what it says, would you observe what it claims?',
]

// A claim's truth does not depend on which artifact quoted it, so proving it twice in one run buys
// nothing. This matters most exactly where it hurt: a second plan round re-extracts most of the
// first round's claims, and without this it pays the full triple for every one of them again.
// Scoped to a single run deliberately — across runs the repo has moved, and a git-state fact rots
// the moment master does.
const provenMemo = new Map()

async function proven(claim, whyLoadBearing, phaseName, context) {
  const memoKey = String(claim).trim()
  if (provenMemo.has(memoKey)) return provenMemo.get(memoKey)
  const votes = await parallel(LENSES.map((lens, i) => () =>
    agent(
      `Try to REFUTE this claim. Default to "refuted" if you cannot establish it — an unprovable claim is false.\n\n` +
      `Claim: ${claim}\nWhy it is load-bearing: ${whyLoadBearing}\n` +
      `${context ? `Context:\n${context}\n` : ''}\n` +
      `Your lens for this attempt: ${lens}\n\n` +
      // The evidence METHOD belongs to the fact-check skill — invoke it rather than
      // restating it here, or this workflow silently keeps a stale copy of the
      // method the day fact-check improves. The VERDICT is not delegated: the
      // caller counts these votes, so no single agent decides what is proven.
      `Use the "fact-check" skill to ground this. Follow its method — strongest evidence first: executable → run a ` +
      `minimal script and paste its ACTUAL output; about this codebase → cite the exact path:line; documentable → ` +
      `confirm across two or more independent authoritative sources. Attach the evidence itself, never your confidence.\n\n` +
      `Return only your own verdict on this one claim. You are one vote of ${LENSES.length}; do not try to reach a ` +
      `balanced conclusion on your own — attack the claim from your lens and report what you actually found.`,
      { label: `refute:${i + 1}`, phase: phaseName, model: tiers.verify, schema: REFUTE_SCHEMA }
    )
  ))
  const valid = votes.filter(Boolean)
  // Not memoized: no verdict is not a verdict, and a transient agent failure must not pin this
  // claim as unproven for the rest of the run.
  if (!valid.length) return { proven: false, why: 'no verifier returned a verdict — treated as unproven' }
  const confirmed = valid.filter(v => v.status === 'confirmed')
  const refuted = valid.filter(v => v.status === 'refuted')
  const verdict = {
    proven: confirmed.length > refuted.length && confirmed.length >= Math.ceil(valid.length / 2),
    why: refuted.length ? refuted.map(v => v.evidence).join(' | ') : confirmed.map(v => v.evidence).join(' | '),
    votes: valid,
  }
  provenMemo.set(memoKey, verdict)
  return verdict
}

// Extract an artifact's load-bearing claims and prove each. Returns BOTH sides
// of the verdict, because the two are used differently and collapsing them was
// the old bug: `rejected` gates (a non-empty result means the gate does not
// open), while `held` is the surviving premise — the only claims later phases
// are allowed to build on.
//
// Keeping only `rejected` made "unprovable = false" a veto and nothing more.
// The claims that SURVIVED were discarded along with the ones that didn't, so
// the next phase re-read the raw artifact and inherited every unexamined
// assertion in it — including the ones no refuter had looked at. A gate that
// only subtracts cannot tell the phase after it what is left standing.
async function adjudicateClaims(artifactName, artifactText, phaseName) {
  const extracted = await agent(
    `Extract ONLY the load-bearing claims from this ${artifactName} — the facts it leans on, where it collapses if the ` +
    `claim is false. Ignore stylistic assertions and hedged asides.\n\n<${artifactName}>\n${artifactText}\n</${artifactName}>`,
    { label: `claims:${artifactName}`, phase: phaseName, model: tiers.verify, schema: CLAIM_LIST }
  )
  const claims = (extracted && extracted.claims) || []
  if (!claims.length) return { held: [], rejected: [], extracted: 0 }
  // Most blast radius first, then cap. Sorting before slicing is the whole point: an arbitrary
  // five of fifteen would be worse than no cap, because it spends the budget on whatever the
  // extractor happened to list first.
  const BLAST = { total: 0, major: 1, moderate: 2 }
  const ranked = [...claims].sort((a, b) => (BLAST[a.blastRadius] ?? 1) - (BLAST[b.blastRadius] ?? 1))
  const examined = ranked.slice(0, maxClaimsPerGate)
  const dropped = ranked.slice(maxClaimsPerGate)
  // Oath rule 7 applies as hard to a cap as to a crash: an unexamined claim that nobody names
  // reads downstream as a claim that passed.
  if (dropped.length) {
    log(`${artifactName}: ${claims.length} load-bearing claims extracted, refuting the ${examined.length} with the ` +
      `largest blast radius (maxClaimsPerGate=${maxClaimsPerGate}). NOT examined, and NOT part of the verified premise:\n` +
      dropped.map(c => `  ? ${c.claim} [${c.blastRadius || 'unranked'}]`).join('\n'))
  }
  const checked = (await parallel(examined.map(c => () =>
    proven(c.claim, c.whyLoadBearing, phaseName, artifactText.slice(0, 4000)).then(r => ({ ...c, ...r }))
  ))).filter(Boolean)
  return {
    held: checked.filter(c => c.proven),
    // Dropped claims are neither held nor rejected — they were never attacked. Counting them as
    // rejected would block the gate on claims no refuter read; counting them as held would smuggle
    // unproven assertions into the premise, which is the exact failure this gate exists to prevent.
    rejected: checked.filter(c => !c.proven),
    extracted: claims.length,
    unexamined: dropped.length,
  }
}

// The verified premise, rendered for the next phase. Only `held` claims appear:
// a phase downstream of a premise gate reads THIS, not the raw artifact, so an
// assertion that failed refutation cannot be silently inherited by being left
// lying in the text it was extracted from.
const premiseBlock = (held) => held.length
  ? `VERIFIED PREMISE — these claims survived adversarial refutation and are the ONLY ones you may treat as\n` +
    `established. Anything else in the artifacts below is unverified: if you need it, prove it yourself with the\n` +
    `"fact-check" skill before you lean on it.\n` +
    held.map(c => `- ${c.claim}\n  evidence: ${c.why || 'see votes'}`).join('\n')
  : `VERIFIED PREMISE: none. No load-bearing claim survived refutation, so you may treat NOTHING in the artifacts\n` +
    `below as established fact. Prove what you need with the "fact-check" skill before leaning on it.`

// A premise gate: adjudicate, log, and hand back the held set. `blocking` says
// whether a rejected claim should stop the run — true at the gates whose output
// everything downstream inherits as fact.
async function premiseGate(artifactName, artifactText, phaseName) {
  const { held, rejected, extracted, unexamined } = await adjudicateClaims(artifactName, artifactText, phaseName)
  note(phaseName, `${extracted} load-bearing claim(s): ${held.length} held, ${rejected.length} refuted` +
    (unexamined ? `, ${unexamined} unexamined (over maxClaimsPerGate)` : ''))
  if (rejected.length) {
    log(`${rejected.length} claim(s) in the ${artifactName} did not survive refutation and are NOT part of the premise:\n` +
      rejected.map(c => `  ✗ ${c.claim} — ${c.why}`).join('\n'))
  }
  return { held, rejected }
}

const record = { phases: [], blockers: [], deferred: [] }
const note = (phase, detail) => { record.phases.push({ phase, detail }); log(`${phase}: ${detail}`) }

// ---------------------------------------------------------------------------
// The retrospective, hoisted so it can close EVERY path that produced work —
// including a run that stopped at the design gate. A run that went sideways is
// the one with the most to teach, so it must not be the path that skips the
// reflection. (A red baseline is the one exception: it aborts before there is
// anything to reflect on.)
// ---------------------------------------------------------------------------
async function runRetro(sliceCount) {
  phase('Retrospective')
  return agent(
    `Close this run with a retrospective. Read the chronicles the agents left in ${chronicleDir}/ — they are the field ` +
    `notes of what actually happened, written as it happened.\n\n` +
    `WHAT HAPPENED:\n${record.phases.map(p => `- ${p.phase}: ${p.detail}`).join('\n')}\n\n` +
    `${record.blockers.length ? `BLOCKERS:\n${record.blockers.map(b => `- ${b.what}: ${JSON.stringify(b.detail).slice(0, 300)}`).join('\n')}\n\n` : ''}` +
    `${record.deferred.length ? `DEFERRED:\n${record.deferred.map(d => `- ${d.what}: ${JSON.stringify(d.detail).slice(0, 300)}`).join('\n')}\n\n` : ''}` +
    `Turn the lens on the run itself: what slowed it down, what was ambiguous, what broke, what you would want to ` +
    `already know next time. Split every finding by what can be acted on NOW:\n` +
    `- evolved-now — anything improvable this session: sharpen a skill ("evolve-skill"), write a missing one ` +
    `("write-a-skill"), fix the docs/ADR/lessons file. DO it, do not just note it.\n` +
    `- filed-for-human — needs a human decision or a future session. File it to ${backlogPath} so it is not lost.\n` +
    `- flagged-blocker — blocking, neither evolvable nor plannable. Surface it plainly.\n\n` +
    `${record.blockers.length ? `This run hit real failures. Use the "postmortem" skill's discipline on them: symptom → root-cause chain → fix → forward-looking rule, and check whether a regression test is missing.\n\n` : ''}` +
    `${libraryIndex ? `Curate the durable lessons into the Library at ${libraryIndex} (one fact per file + index): conventions, gotchas, token calibrations, settled decisions, tooling. Noise dies with the chronicle.\n\n` : ''}` +
    `Token spend this run: ~${Math.round(budget.spent() / 1000)}k output tokens across ${sliceCount} slice(s) — ` +
    `record it as a calibration lesson so the next run's reserve is a number, not a guess.\n\n` +
    `The output is an artifact: a short WRITTEN reflection committed to the repo, not a feeling that it went fine.`,
    { label: 'retro', phase: 'Retrospective', model: tiers.retro, schema: RETRO_SCHEMA }
  )
}

// ---------------------------------------------------------------------------
// PHASE 1 — Guardrails & baseline. The lifecycle starts by learning the repo's
// own hard-won rules, not the spec. A red baseline ABORTS: you do not build on
// a broken baseline, and here that is a throw rather than a temptation.
// ---------------------------------------------------------------------------
phase('Baseline')
const baseline = await agent(
  `Establish the guardrail baseline for this repo BEFORE any change is made.\n\n` +
  `Work to do later (context only — do NOT start it): ${cfg.goal}\n\n` +
  `1. Read the repo's own hard-won rules and catalogue the pitfalls they warn about: LESSONS-LEARNED*, docs/adr/, ` +
  `README, CONTRIBUTING, CLAUDE.md. These become checks to actively guard against.\n` +
  `2. Identify the guardrails this change needs — linter, formatter, unit tests, integration tests, and a CI that runs them.\n` +
  `3. RUN them, right now, unchanged. Report each command with its ACTUAL output tail and whether it passed.\n` +
  `4. Report any guardrail that is simply missing.\n\n` +
  `Do not fix anything. Do not write code. This phase only observes and reports.\n\n${LIBRARY_RULE}\n${CHRONICLE_RULE(chronicle('baseline'))}`,
  { label: 'baseline', phase: 'Baseline', model: tiers.baseline, schema: BASELINE_SCHEMA }
)
if (!baseline) throw new Error('sdlc-workhorse: baseline agent returned nothing — cannot proceed without a known starting state.')
if (!baseline.green) {
  const failed = baseline.checks.filter(c => !c.passed).map(c => `${c.command}\n${c.output}`).join('\n---\n')
  throw new Error(
    `sdlc-workhorse: BASELINE IS RED — refusing to build on a broken baseline.\n\n${failed}\n\n` +
    `Fix the baseline (or run with the failing checks excluded, deliberately) and re-dispatch.`
  )
}
note('Baseline', `green across ${baseline.checks.length} check(s); ${baseline.pitfalls.length} repo pitfall(s) catalogued`)
if (baseline.missingGuardrails.length) {
  record.deferred.push({ what: 'missing guardrails', detail: baseline.missingGuardrails })
  log(`Missing guardrails filed to ${backlogPath}: ${baseline.missingGuardrails.join('; ')}`)
}

const pitfallRule = baseline.pitfalls.length
  ? `This repo's own hard-won rules — violating one is a defect, not a style opinion:\n${baseline.pitfalls.map(p => `- ${p}`).join('\n')}`
  : ''

// ---------------------------------------------------------------------------
// PHASE 2 — Specify.
// ---------------------------------------------------------------------------
phase('Spec')
const spec = await agent(
  `Write the spec for this work. No code, no design — what and why only.\n\nGOAL: ${cfg.goal}\n\n${pitfallRule}\n\n` +
  `Problem, goal, scope, NON-GOALS, and observable success criteria. Save it in the repo and report the path.\n` +
  `Use the "to-prd" skill if it is available.\n\n${FACT_CHECK_RULE}\n\n${BACKLOG_RULE}\n${CHRONICLE_RULE(chronicle('spec'))}`,
  { label: 'spec', phase: 'Spec', model: tiers.spec, schema: SPEC_SCHEMA }
)
if (!spec) throw new Error('sdlc-workhorse: spec agent returned nothing.')
note('Spec', `${spec.scope.length} in scope, ${spec.nonGoals.length} non-goals, ${spec.successCriteria.length} success criteria`)

const specText = JSON.stringify(spec, null, 2)

// The spec is a premise gate: everything downstream treats it as the statement
// of what correct means, so its load-bearing claims are refuted BEFORE the
// grill sharpens it. Non-blocking by design — a refuted claim here is exactly
// what the grill exists to resolve, and stopping the run would deny it the
// chance. What it must not do is pass silently into the grill as established.
const specPremise = await premiseGate('spec', specText, 'Spec')

// ---------------------------------------------------------------------------
// PHASE 3 — Grill the requirements. A fresh agent attacks the spec. It is
// handed the spec as TEXT and nothing else — it cannot inherit the author's
// rationale, because it never had it. Bounded: an unresolved hole after
// maxGrillRounds is deferred, not looped on forever.
// ---------------------------------------------------------------------------
phase('Grill')
let grill = null
let sharpSpec = specText
for (let round = 1; round <= maxGrillRounds; round++) {
  grill = await agent(
    `Grill this spec. You did NOT write it and you owe it nothing.\n\n${premiseBlock(specPremise.held)}\n\n` +
    `<spec>\n${sharpSpec}\n</spec>\n\n${pitfallRule}\n\n` +
    `Attack every load-bearing ambiguity: what does this NOT say that someone must know to build it? Where could two ` +
    `readers implement opposite things and both claim to have followed it? What is asserted about the domain that ` +
    `nobody verified? Resolve each hole you can from the repo and the domain; write acceptance criteria.\n\n` +
    `Use the "grill-with-docs" skill if available (fallback "grill-me"), and record crystallised decisions as ADRs / ` +
    `CONTEXT.md updates.\n\n${FACT_CHECK_RULE}\n\n${NO_HUMAN_RULE}\n\nRound ${round} of ${maxGrillRounds}.\n\n` +
    `${BACKLOG_RULE}\n${CHRONICLE_RULE(chronicle('grill'))}`,
    { label: `grill:r${round}`, phase: 'Grill', model: tiers.grill, schema: GRILL_SCHEMA }
  )
  if (!grill) break
  const unresolved = grill.holes.filter(h => h.severity === 'load-bearing' && h.resolution === 'unresolved')
  note('Grill', `round ${round}: ${grill.holes.length} hole(s), ${unresolved.length} load-bearing unresolved`)
  if (grill.verdict === 'sharp' && !unresolved.length) break
  sharpSpec = sharpSpec + `\n\nGRILL ROUND ${round} RESOLUTIONS:\n` + JSON.stringify(grill.holes, null, 2)
  if (round === maxGrillRounds && unresolved.length) {
    record.deferred.push({ what: 'unresolved load-bearing questions after grilling', detail: unresolved.map(h => h.question) })
    log(`${unresolved.length} load-bearing question(s) survived ${maxGrillRounds} rounds — deferred to ${backlogPath} with the chosen defaults.`)
  }
}
const acceptance = (grill && grill.acceptanceCriteria) || spec.successCriteria

// The grill's output IS the premise the rest of the run builds on — the
// acceptance criteria become the RED tests, and the sharpened spec is what the
// reviewer judges the diff against. So it is adjudicated before the plan sees
// it, and only the surviving claims are carried forward. A criterion that
// cannot be grounded is worse than a missing one: it becomes a test asserting
// something nobody established, and a green suite then certifies it.
const grillPremise = await premiseGate(
  'sharpened spec', sharpSpec + '\n\nACCEPTANCE CRITERIA:\n' + acceptance.map(a => `- ${a}`).join('\n'), 'Grill')
const heldPremise = [...specPremise.held, ...grillPremise.held]

// ---------------------------------------------------------------------------
// PHASES 4–5 — Plan, then have a fresh agent grill it. The cheapest place to
// kill a design mistake is before the first line of code. The reviewer is a
// separate agent() call: it structurally cannot inherit the planner's blind
// spots, because it never saw the planner's reasoning — only the artifact.
// The plan's load-bearing claims are refuted-tested; a refuted claim sends the
// plan back regardless of what the reviewer thought of it.
// ---------------------------------------------------------------------------
let plan = null
let planReview = null
let planFeedback = ''
let planHeld = []
for (let round = 1; round <= maxPlanRounds; round++) {
  phase('Plan')
  plan = await agent(
    `Design the implementation. Still NO code.\n\n${premiseBlock(heldPremise)}\n\n<spec>\n${sharpSpec}\n</spec>\n\n` +
    `ACCEPTANCE CRITERIA:\n${acceptance.map(a => `- ${a}`).join('\n')}\n\n${pitfallRule}\n` +
    `${planFeedback ? `\nA previous design round was REJECTED. You must address every point:\n${planFeedback}\n` : ''}\n` +
    `Approach; key components and interfaces; data and control flow; failure modes; alternatives considered and WHY ` +
    `rejected; the test strategy. Save the plan in the repo and report the path.\n\n${FACT_CHECK_RULE}\n\n` +
    `${BACKLOG_RULE}\n${CHRONICLE_RULE(chronicle('plan'))}`,
    { label: `plan:r${round}`, phase: 'Plan', model: tiers.plan, schema: PLAN_SCHEMA }
  )
  if (!plan) throw new Error('sdlc-workhorse: plan agent returned nothing.')

  phase('Plan review')
  const planText = JSON.stringify(plan, null, 2)
  const [review, refuted] = await parallel([
    () => agent(
      `Grill this implementation plan. You did NOT write it. The planner cannot grade their own homework and you are ` +
      `not here to be agreeable.\n\n<spec>\n${sharpSpec}\n</spec>\n\n<plan>\n${planText}\n</plan>\n\n${pitfallRule}\n\n` +
      `Hunt specifically for: hidden coupling; failure modes it does not handle; a wrong abstraction; a materially ` +
      `cheaper path to the same outcome; and the big one — does it actually satisfy the spec, or a nearby easier ` +
      `problem? Mark a finding mustFix only if shipping this plan unchanged would be a defect.\n\n` +
      `Use the "grill-with-docs" skill if available.\n\n${NO_HUMAN_RULE}\n\n${CHRONICLE_RULE(chronicle('plan-review'))}`,
      { label: `plan-review:r${round}`, phase: 'Plan review', model: tiers.planReview, schema: PLAN_REVIEW_SCHEMA }
    ),
    () => premiseGate('plan', planText, 'Plan review'),
  ])
  planReview = review
  planHeld = (refuted && refuted.held) || []
  const bad = ((refuted && refuted.rejected) || []).filter(Boolean)
  const mustFix = (review && review.findings.filter(f => f.mustFix)) || []
  note('Plan review', `round ${round}: verdict=${review ? review.verdict : 'none'}, ${mustFix.length} must-fix, ${bad.length} refuted claim(s)`)

  if (review && review.verdict === 'approved' && !mustFix.length && !bad.length) break

  planFeedback =
    (mustFix.length ? `Must-fix findings:\n${mustFix.map(f => `- [${f.category}] ${f.concern}`).join('\n')}\n` : '') +
    (bad.length ? `\nClaims this plan leans on that could NOT be proven (treat as false):\n${bad.map(c => `- ${c.claim}\n    why it failed: ${c.why}`).join('\n')}\n` : '')

  if (review && review.verdict === 'reopens-requirements') {
    record.blockers.push({ what: 'plan review reopened a requirement', detail: planFeedback })
    log('Plan review reopened a requirement — that is the process working. Deferring rather than looping the whole lifecycle.')
    break
  }
  if (round === maxPlanRounds) {
    record.blockers.push({ what: `plan unapproved after ${maxPlanRounds} design rounds`, detail: planFeedback })
    log(`Plan still unapproved after ${maxPlanRounds} rounds — proceeding would be building on a design nobody signed off.`)
  }
}

if (record.blockers.length) {
  log('Stopping before any code: the design did not clear its gate. No code before the plan is reviewed.')
  // Still close properly — a design that failed its gate twice is exactly the
  // kind of run whose lessons are worth keeping.
  const retro = await runRetro(0)
  return {
    goal: cfg.goal,
    stoppedAt: 'Plan review',
    baseline,
    spec,
    plan,
    planReview,
    retro,
    blockers: record.blockers,
    deferred: record.deferred,
    mergeReady: false,
    mergeBlockedBy: record.blockers.map(b => b.what),
    reproduction: { goal: cfg.goal, tiers, backlogPath, chronicleDir, tokensSpent: budget.spent() },
  }
}

// ---------------------------------------------------------------------------
// PHASE 6 — Slice into tracer bullets.
// ---------------------------------------------------------------------------
phase('Slice')
const sliced = await agent(
  `Break this approved plan into independently shippable vertical slices — tracer bullets, each one end-to-end and ` +
  `each with a single observable acceptance criterion that ONE test can encode.\n\n` +
  `<plan>\n${JSON.stringify(plan, null, 2)}\n</plan>\n\nACCEPTANCE CRITERIA:\n${acceptance.map(a => `- ${a}`).join('\n')}\n\n` +
  `Assign each slice the LOWEST tier that can actually do it: haiku for mechanical, sonnet default, opus only for ` +
  `genuine design risk. Record the slices in ${backlogPath} as the live source of truth.\n\n${CHRONICLE_RULE(chronicle('slice'))}`,
  { label: 'slice', phase: 'Slice', model: tiers.slice, schema: SLICES_SCHEMA }
)
if (!sliced || !sliced.slices.length) throw new Error('sdlc-workhorse: slicing produced no slices.')

let slices = sliced.slices
if (slices.length > maxSlices) {
  log(`${slices.length} slices produced, capping at ${maxSlices}. NOT worked this run: ${slices.slice(maxSlices).map(s => s.id).join(', ')} — left in ${backlogPath}.`)
  record.deferred.push({ what: 'slices deferred past the cap', detail: slices.slice(maxSlices).map(s => s.id) })
  slices = slices.slice(0, maxSlices)
}
note('Slice', `${slices.length} tracer bullet(s): ${slices.map(s => `${s.id}[${s.tier}]`).join(', ')}`)

// ---------------------------------------------------------------------------
// PHASES 7–9 — Build and review, as a pipeline so a slice hits review the
// moment it is green rather than waiting on its slowest sibling.
//
// RED is verified by a DIFFERENT agent than the one that wrote the test. That
// is the gate prose cannot hold: "write a failing test first" is trivially
// satisfiable by a test that fails on a typo, and the author is the last one
// who will notice. Here the red output is re-read by a fresh cheap agent that
// only answers "did this fail for the reason claimed?".
//
// isolation:'worktree' only when slices actually run concurrently — otherwise
// the lone builder should use the working tree it was dispatched into.
// ---------------------------------------------------------------------------
phase('Build')
const poolSize = Math.max(1, Math.min(parallelSlices, maxWorkers, slices.length))
const isolate = poolSize > 1
if (isolate) log(`${poolSize} slices in flight — each gets its own worktree; expect a PR stack (hand it to merge-stack).`)

const built = await pipeline(
  slices,
  // Stage 1 — RED, then an independent check that it is a real red.
  async (slice) => {
    if (budget.total && budget.remaining() < reserve) {
      log(`slice ${slice.id}: not started — ${Math.round(budget.remaining() / 1000)}k left is under the ${Math.round(reserve / 1000)}k reserve.`)
      return { slice, skipped: 'budget' }
    }
    const red = await agent(
      `Slice "${slice.id}" — ${slice.title}\nACCEPTANCE CRITERION: ${slice.acceptanceCriterion}\n\n` +
      `<plan>\n${JSON.stringify(plan, null, 2)}\n</plan>\n\n${pitfallRule}\n\n` +
      `Write EXACTLY ONE failing test that encodes the acceptance criterion. Write NO implementation — not a stub, not ` +
      `a signature. Run the test. Paste its ACTUAL output.\n\n` +
      `The test must fail because the BEHAVIOUR is absent, not because of an import error, a typo, or a missing ` +
      `fixture. A test that fails for the wrong reason proves nothing and will be rejected.\n\n` +
      `Use the "tdd" skill's RED discipline.\n\n${LIBRARY_RULE}\n${CHRONICLE_RULE(chronicle(`slice-${slice.id}`))}`,
      { label: `red:${slice.id}`, phase: 'Build', model: slice.tier, schema: RED_SCHEMA, isolation: isolate ? 'worktree' : undefined }
    )
    if (!red) return { slice, skipped: 'red agent returned nothing' }

    const redCheck = await agent(
      `A test was just written for this acceptance criterion: ${slice.acceptanceCriterion}\n\n` +
      `Command: ${red.testCommand}\nOutput:\n${red.output}\n\n` +
      `Answer one question with evidence: did this fail because the ASSERTED BEHAVIOUR is missing, or did it fail for ` +
      `an unrelated reason (import error, syntax error, missing fixture, wrong path, test never ran)? ` +
      `An unrelated failure is a FALSE RED and must be refuted.`,
      { label: `red-check:${slice.id}`, phase: 'Build', model: tiers.verify, schema: REFUTE_SCHEMA }
    )
    const realRed = red.failedForTheRightReason && redCheck && redCheck.status !== 'refuted'
    if (!realRed) {
      log(`slice ${slice.id}: FALSE RED rejected — ${redCheck ? redCheck.evidence : 'no independent check'}`)
      return { slice, skipped: 'false red', red }
    }
    return { slice, red }
  },
  // Stage 2 — GREEN, then refactor with tests green.
  async (prev) => {
    if (prev.skipped) return prev
    const { slice, red } = prev
    const green = await agent(
      `Slice "${slice.id}" — make this failing test pass, then refactor.\n\n` +
      `Test: ${red.testPath}\nCommand: ${red.testCommand}\nIt currently fails:\n${red.output}\n\n` +
      `<plan>\n${JSON.stringify(plan, null, 2)}\n</plan>\n\n${pitfallRule}\n\n` +
      `Write the MINIMAL code that makes it pass (GREEN), run it, then refactor with the test staying green. Do not ` +
      `touch the test to make it pass. Do not implement anything the criterion did not ask for — out-of-scope work is ` +
      `filed to ${backlogPath}, never absorbed.\n\n` +
      `Truth before all: before any unverified fact enters the code — an API's behaviour, a version/compat claim, a ` +
      `copied constant — run the "fact-check" skill and prove it with a runnable experiment or authoritative sources. ` +
      `Unprovable means false. If the root cause turns out to be something other than you assumed, that discovery is a ` +
      `success: say so and act on it.\n\nUse the "tdd" skill's GREEN → REFACTOR discipline.\n\n` +
      `${BACKLOG_RULE}\n${CHRONICLE_RULE(chronicle(`slice-${slice.id}`))}`,
      { label: `green:${slice.id}`, phase: 'Build', model: slice.tier, schema: GREEN_SCHEMA, isolation: isolate ? 'worktree' : undefined }
    )
    return { ...prev, green }
  },
  // Stage 3 — fresh reviewer(s) grill the diff, then findings are refute-tested.
  async (prev) => {
    if (prev.skipped || !prev.green || !prev.green.passed) return prev
    const { slice } = prev
    // One reviewer. `concern` non-null = one lens of a quorum; null = the single stance.
    const grill = (concern) => agent(
      `Grill the diff for slice "${slice.id}" (${slice.title}). You never saw the author's rationale and you are not ` +
      `here to be agreeable. Read the actual diff from the repo.\n\n` +
      (concern ? `YOUR LENS: ${concern}. Review ONLY through it — other reviewers cover the other concerns, and a ` +
                 `finding outside your lens is theirs to make, not yours to guess at.\n\n` : '') +
      `ACCEPTANCE CRITERION: ${slice.acceptanceCriterion}\n\n${pitfallRule}\n\n` +
      `Go hunk by hunk: what must be true for this to be correct? What input breaks it? What caller relied on the old ` +
      `behaviour? Every finding needs a CONCRETE failure scenario — inputs/state → wrong output/crash. A finding ` +
      `without one is speculation and does not count.\n\n` +
      // code-review-grill is bookended by two ALWAYS-ASK human gates (Step 0
      // stance, Step 7 posting). There is no human in this run, so they are
      // pre-answered here. An autonomous agent left to hit those gates either
      // stalls or improvises past the skill's own rules.
      `Use the "code-review-grill" skill, with its two human gates already decided for you — do NOT ask, and do NOT ` +
      `skip the skill because you cannot ask:\n` +
      `- Step 0 (stance): you ARE the single adversarial reviewer for this task${concern ? ` on the "${concern}" concern` : ''}. ` +
      `Decided; do not prompt. Do NOT try to convene a quorum or spawn reviewer subagents — you have no Agent/Task ` +
      `tool, and the quorum is already fanned out by the script that dispatched you. Grill the diff yourself.\n` +
      `- Step 7 (posting): do NOT post anything to any PR, and do not open one. Return your findings as this task's ` +
      `result instead — the human decides what gets posted, and this run has no authority to speak on a PR.\n` +
      `Everything else in the skill applies in full — especially Step 4: read this project's own documentation and ` +
      `distil its house rules first, because the same construct that is right in one architecture is a defect in another.\n\n` +
      `${NO_HUMAN_RULE}\n\n${CHRONICLE_RULE(chronicle(`review-${slice.id}${concern ? `-${concern}` : ''}`))}`,
      { label: `review:${slice.id}${concern ? `:${concern}` : ''}`, phase: 'Review',
        model: tiers.review, schema: REVIEW_SCHEMA }
    )
    // THE QUORUM IS THE SCRIPT'S TO CONVENE. A reviewer agent has no Agent/Task tool,
    // so telling one "you are a quorum reviewer" got a single agent role-playing several
    // — the concerns collapse into one pass and the independence that makes a quorum
    // worth its cost is silently gone. Fan out here instead: one agent per concern, each
    // blind to the others. Same fix as the nights-watch grill (PFalkowski/skills#46).
    const reviews = reviewStance === 'quorum'
      ? (await parallel(reviewConcerns.map(c => () => grill(c).then(r => ({ r, c })))))
          .filter(Boolean).filter(x => x.r)
          .flatMap(x => ((x.r.findings) || []).map(f => ({ ...f, concern: x.c })))
      : (((await grill(null)) || {}).findings || [])
    // Lenses overlap, so the same defect can arrive more than once. Drop exact restatements
    // before paying to verify each; paraphrases survive to verification, which is the real
    // filter anyway — this only avoids obviously duplicated work.
    const seen = new Set()
    const findings = reviews.filter(f => {
      const k = `${f.file || ''}::${String(f.summary || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`
      return seen.has(k) ? false : (seen.add(k), true)
    })
    if (reviewStance === 'quorum') {
      log(`slice ${slice.id}: ${reviewConcerns.length} concern(s) reviewed, ` +
          `${reviews.length} raw finding(s) → ${findings.length} after dedupe`)
    }
    // Verify before reporting: a plausible-but-wrong finding costs a real fix cycle.
    const verified = await parallel(findings.map(f => () =>
      proven(f.summary, f.failureScenario, 'Review', `Slice: ${slice.title}\nCriterion: ${slice.acceptanceCriterion}`)
        .then(v => ({ ...f, confirmed: v.proven, evidence: v.why }))
    ))
    const real = verified.filter(Boolean).filter(f => f.confirmed)
    log(`slice ${slice.id}: ${findings.length} finding(s), ${real.length} survived verification`)
    return { ...prev, findings: real }
  }
)

const results = built.filter(Boolean)
const done = results.filter(r => !r.skipped && r.green && r.green.passed)
const failed = results.filter(r => r.skipped || !r.green || !r.green.passed)
for (const f of failed) {
  record.blockers.push({ what: `slice ${f.slice.id} did not land`, detail: f.skipped || 'never went green' })
}
note('Build', `${done.length}/${slices.length} slice(s) green`)

const blockerFindings = done.flatMap(r => (r.findings || []).filter(f => f.severity === 'blocker' || f.severity === 'major'))
if (blockerFindings.length) {
  log(`${blockerFindings.length} verified blocker/major finding(s) — these are real defects, not opinions.`)
}

// ---------------------------------------------------------------------------
// PHASE 10 — Document. Docs ship in the same PR as the code, not "later".
// It is a phase in the script, so it cannot be the thing that gets dropped
// when the run is running long.
// ---------------------------------------------------------------------------
phase('Document')
const docs = done.length ? await agent(
  `Document what actually shipped in this run. Docs ship in the SAME PR as the code — never "later".\n\n` +
  `GOAL: ${cfg.goal}\n\nSLICES LANDED:\n${done.map(r => `- ${r.slice.id}: ${r.slice.title} — ${r.green.summary}`).join('\n')}\n\n` +
  `<plan>\n${JSON.stringify(plan, null, 2)}\n</plan>\n\n${pitfallRule}\n\n` +
  `Update: user-facing docs / README usage where behaviour changed; an ADR for each load-bearing decision the plan ` +
  `made (including the alternatives it rejected and why); a changelog entry. Match the docs to the SHIPPED behaviour, ` +
  `not to the plan's intent — where they diverged, the code is the truth.\n\n` +
  `Then re-run the Phase-1 baseline checks and report whether they are still green:\n` +
  `${baseline.checks.map(c => `- ${c.command}`).join('\n')}\n\n${CHRONICLE_RULE(chronicle('document'))}`,
  { label: 'document', phase: 'Document', model: tiers.document, schema: {
    type: 'object',
    required: ['docsChanged', 'baselineStillGreen', 'baselineOutput'],
    properties: {
      docsChanged: { type: 'array', items: { type: 'string' } },
      adrsWritten: { type: 'array', items: { type: 'string' } },
      baselineStillGreen: { type: 'boolean' },
      baselineOutput: { type: 'string', description: 'Actual output of re-running the baseline checks.' },
    },
  } }
) : null
if (docs && !docs.baselineStillGreen) {
  record.blockers.push({ what: 'baseline regressed', detail: docs.baselineOutput })
  log('BASELINE REGRESSED — the change broke a check that was green before it. Not merge-ready.');
}

// ---------------------------------------------------------------------------
// PHASE 11 — Retrospective (see runRetro above — it closes every path that
// produced work, not just the happy one).
// ---------------------------------------------------------------------------
const retro = await runRetro(slices.length)

// ---------------------------------------------------------------------------
// The workflow never merges, publishes, migrates, or spends. There is no code
// path here that can — the irreversible line is enforced by absence, not by an
// instruction a tired agent might read past. It hands back a merge-ready
// report and the human takes it from there.
// ---------------------------------------------------------------------------
const mergeReady =
  done.length === slices.length &&
  !record.blockers.length &&
  !blockerFindings.length &&
  !!docs && docs.baselineStillGreen

return {
  goal: cfg.goal,
  mergeReady,
  mergeBlockedBy: mergeReady ? [] : [
    ...(done.length !== slices.length ? [`${slices.length - done.length} slice(s) not green`] : []),
    ...record.blockers.map(b => b.what),
    ...(blockerFindings.length ? [`${blockerFindings.length} verified blocker/major review finding(s)`] : []),
    ...(docs && !docs.baselineStillGreen ? ['baseline regressed'] : []),
  ],
  baseline: { green: baseline.green, checks: baseline.checks.map(c => c.command), pitfalls: baseline.pitfalls },
  spec,
  plan,
  planReview,
  slices: results.map(r => ({
    id: r.slice.id,
    title: r.slice.title,
    tier: r.slice.tier,
    green: !!(r.green && r.green.passed),
    skipped: r.skipped || null,
    testPath: r.red ? r.red.testPath : null,
    verifiedFindings: (r.findings || []).map(f => ({ severity: f.severity, summary: f.summary, evidence: f.evidence })),
  })),
  docs,
  retro,
  blockers: record.blockers,
  deferred: record.deferred,
  // Everything a human (or the next run) needs to pick this up cold.
  reproduction: { goal: cfg.goal, tiers, parallel: poolSize, backlogPath, chronicleDir, tokensSpent: budget.spent() },
}
