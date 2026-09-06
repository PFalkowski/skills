export const meta = {
  name: 'housekeeping-sweep',
  description: 'Sweep the code for what the now-true documentation says it should be: warnings, smells, bugs, test gaps, duplication, library and architecture drift — verified, then grouped into sized work items',
  phases: [{ title: 'House rules' }, { title: 'Lenses' }, { title: 'Verify' }, { title: 'Plan' }],
}
// args: { startedAt: '08-15 21:04',
//         lenses: ['warnings', 'bugs', ...],     // null → the default catalogue below
//         maxLenses: 6,
//         docsAreTrue: true,                     // the doc audit + cleanup ran first (see below)
//         intendedArchitecture: 'DDD, ports & adapters — see docs/adr/0004.md',
//         checks: { build: 'dotnet build -warnaserror', test: 'dotnet test', lint: null },
//         scope: ['src/Billing/**'],             // null → the whole repo
//         isolate: false,
//         reserve: 40000, chronicleDir: '.agents/housekeeping/chronicles', libraryIndex: null,
//         tiers: { rules: 'haiku', lens: 'sonnet', verify: 'sonnet', plan: 'sonnet' } }
//
// WHY THIS RUNS AFTER THE DOC AUDIT, and not instead of it: half the lenses below judge the code
// against what the documentation SAYS it should be — the intended architecture, the chosen
// libraries, the documented invariants. Run against drifted documentation, an architecture-drift
// lens measures the code against a description of a system nobody built, and every finding it
// produces is noise wearing a citation. Fix the map first, then measure the territory.
//
// THIS SCRIPT CHANGES NOTHING. No fix path, no ticket path, no commit path. It returns candidate
// work; the conductor and the human decide what becomes a change and what becomes a ticket. The
// filing is deliberately NOT here — see FILING.md: posting to a tracker is outward-facing, and an
// unattended script is the wrong thing to hold that authority.
//
// THE WALL (#46): an agent inside a Workflow cannot spawn. Every fan-out is the script's own.

if (typeof args === 'string') args = JSON.parse(args)

const startedAt = args.startedAt || ''
const say = (m) => log(startedAt ? `[${startedAt}] ${m}` : m)

// The catalogue. Each lens is ONE agent, blind to the others: a single agent asked to cover six
// concerns covers the two it finds interesting and reports the set as complete. The 'evidence'
// column is what separates a finding from an opinion — every lens says how its findings are proved.
const CATALOGUE = {
  warnings: `Compiler, analyzer and linter warnings. RUN the repo's own build and lint${args.checks?.build ? ` (\`${args.checks.build}\`)` : ''} and read the real output — do not predict warnings from reading code. Group by rule id, count them, and say which are one-line fixes and which are symptoms. Suppressed or baselined warnings count: say what is being hidden.`,
  bugs: `Latent defects: wrong logic, unhandled failure modes, race conditions, resource leaks, off-by-one, swallowed exceptions, null/None paths, unchecked external input. Each needs a concrete failure scenario — inputs and state → wrong outcome. Prove it where you can: a runnable snippet and its output beats a reading.`,
  'tests-unit': `Logic with no unit coverage that would cost real money to get wrong: branching business rules, calculations, parsers, state machines, error paths. Name the specific untested behaviour, not the coverage percentage — a percentage tells nobody what to write. Run the coverage tool if the repo has one${args.checks?.test ? ` (\`${args.checks.test}\`)` : ''}.`,
  'tests-integration': `Seams that only fail when assembled: persistence, HTTP boundaries, message handlers, transactions, migrations, auth, serialization contracts. Where does the suite mock the very thing most likely to break? Name the seam and the failure it would not catch.`,
  duplication: `The same logic implemented more than once — copy-paste, and the subtler kind where two implementations of one rule have already diverged. Divergence is the finding: say which copy is right, and what the other would produce differently.`,
  'library-consistency': `Two dependencies doing one job — two HTTP clients, two JSON serializers, two mediators, two ways to publish a domain event, two date libraries, two mocking frameworks, two logging APIs. Say which is dominant by usage, which is documented as chosen, and what each of the stragglers costs. Also: dependencies pulled in for one call, and abandoned/unmaintained ones.`,
  'architecture-drift': `Where the code departs from the architecture this repo DOCUMENTS for itself: layering violations, domain logic in controllers or in the persistence layer, entities leaking through APIs, anaemic domain where a rich one is documented, cross-aggregate references, infrastructure imported by the domain, a pattern applied in half the codebase. Judge only against what the docs actually state — an architecture you personally prefer is not drift.`,
  smells: `Code health with a named cost: functions and classes too large to hold in one head, deep nesting, long parameter lists, primitive obsession where a documented value object exists, dead code, TODO/FIXME/HACK older than the story around them, commented-out code. Say what each one costs the next person to touch it — a smell without a cost is a preference.`,
  formatting: `Mechanical consistency: files that a run of the repo's own formatter would change, style rules configured but not enforced, missing or unenforced editorconfig/formatter/pre-commit setup, line-ending or encoding inconsistency. This one is cheap to fix and easy to over-report — report the SETUP gap and the file count, not a list of files.`,
}
const DEFAULT_LENSES = ['warnings', 'bugs', 'tests-unit', 'tests-integration', 'duplication', 'library-consistency', 'architecture-drift', 'smells', 'formatting']

const CANDIDATES = { type: 'object', properties: { candidates: { type: 'array', items: { type: 'object',
  properties: {
    title: { type: 'string', minLength: 1 },
    where: { type: 'string', minLength: 1 },              // path:line, or a glob for a repo-wide one
    problem: { type: 'string', minLength: 1 },
    cost: { type: 'string', minLength: 1 },               // what it costs, concretely. "unclean" is not a cost
    fix: { type: 'string', minLength: 1 },                // the sketch, not the patch
    effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'nit'] },
    evidence: { type: 'string', minLength: 1 } },         // command + output, or path:line read
  required: ['title', 'where', 'problem', 'cost', 'fix', 'effort', 'severity', 'evidence'] } } },
  required: ['candidates'] }

const VERDICT = { type: 'object', properties: {
  refuted: { type: 'boolean' },
  why: { type: 'string', minLength: 1 },
  severity: { type: ['string', 'null'], enum: ['critical', 'high', 'medium', 'low', 'nit', null] },
  effort: { type: ['string', 'null'], enum: ['S', 'M', 'L', 'XL', null] },
  proof: { type: ['string', 'null'] } },
  required: ['refuted', 'why'] }

const PLAN = { type: 'object', properties: { items: { type: 'array', items: { type: 'object',
  properties: {
    title: { type: 'string', minLength: 1 },
    covers: { type: 'array', items: { type: 'string' } },   // candidate ids folded into this item
    why: { type: 'string', minLength: 1 },
    effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    recommendation: { type: 'string', enum: ['now', 'ticket', 'drop'] },
    dependsOn: { type: 'array', items: { type: 'string' } } },
  required: ['title', 'covers', 'why', 'effort', 'risk', 'recommendation'] } } },
  required: ['items'] }

const RANK = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 }
const norm = s => String(s || '').trim().toLowerCase().replace(/[\s:]+/g, '-')
const key = c => `${norm(c.where)}:${norm(c.title).slice(0, 50)}`

const RESERVE = args.reserve ?? 40000
let committed = 0
const claim_ = n => {
  const need = RESERVE * n
  if (budget.total && budget.remaining() - committed < need) return false
  committed += need
  return () => { committed -= need }
}

const uncovered = []
const refuted = []

const NO_SPAWN = `You are the ONLY agent on your task. You have no Agent, Task or Workflow tool — do
NOT convene, spawn or delegate; anything that appears to work is role-play. Work in this context.`
const NO_FIX = `You are SURVEYING, not fixing. Change no source file, write no test, install nothing,
commit nothing, open no issue or PR. Running the repo's own build, lint, test and coverage commands
is expected — that is how findings get evidence. Return candidates.`

// Lens selection is DYNAMIC: what the conductor asked for, bounded by what the budget can verify.
// Each lens costs its own agent plus a verifier per candidate; RESERVE * 3 is the working estimate.
const requested = (args.lenses ?? DEFAULT_LENSES).filter(l => CATALOGUE[l])
const affordable = budget.total ? Math.max(1, Math.floor(budget.remaining() / (RESERVE * 3))) : Infinity
const lenses = requested.slice(0, Math.max(1, Math.min(args.maxLenses ?? requested.length, affordable)))
const dropped = requested.filter(l => !lenses.includes(l))
// A dropped lens is NAMED, never silently absent: an unexamined concern that nobody mentions reads
// downstream exactly like a concern that came back clean.
if (dropped.length) { dropped.forEach(l => uncovered.push(`lens '${l}': not run — ${affordable < requested.length ? 'budget' : 'maxLenses'} bound`)); say(`lenses bounded: running ${lenses.join(', ')}; NOT run: ${dropped.join(', ')}`) }

// ---------------------------------------------------------------------------
// Phase 1 — House rules. Distilled once by one cheap agent instead of every lens paying to
// rediscover them, and it is what makes 'architecture-drift' and 'library-consistency' mean
// anything: they measure the code against THIS repo's stated intent, not against a general taste.
// ---------------------------------------------------------------------------
phase('House rules')
const houseRules = await agent(
  `Read this repository's own documentation — README, docs/, ADRs, CONTRIBUTING, coding guidelines,
   architecture notes, the build and lint configuration — and distil the HOUSE RULES that code here
   is supposed to obey: the architecture style and layering rules, the chosen libraries for each
   job, naming and idiom conventions, testing expectations, and any decision a change could violate.
   ${args.intendedArchitecture ? `The conductor states the intended architecture is: ${args.intendedArchitecture}. Confirm that against the docs and say if the docs disagree.` : ''}
   ${args.docsAreTrue ? 'This repository just went through a documentation audit, so these docs have been checked against the code — treat them as trustworthy.' : 'CAUTION: these docs have NOT been verified against the code. Where a rule looks stale, say so rather than enforcing it.'}
   ${args.libraryIndex ? `Also read the Library index at ${args.libraryIndex} and fold in this repo's recorded conventions and gotchas.` : ''}
   Name the build, lint, test and coverage commands you find, verbatim.
   Return a terse rulebook, under 50 lines. ${NO_FIX} ${NO_SPAWN}`,
  { label: 'house-rules', phase: 'House rules', model: args.tiers?.rules ?? 'haiku' })
if (!houseRules) say('house-rules agent died — each lens will read the docs itself')

// ---------------------------------------------------------------------------
// Phases 2+3 — one agent per lens, blind to the others; each lens's candidates go to their
// verifiers as soon as that lens returns. Pipeline, not barrier: the plan needs everything, the
// verification does not.
// ---------------------------------------------------------------------------
phase('Lenses')
const perLens = await pipeline(
  lenses,
  (lens) => (async () => {
    const release = claim_(1)
    if (!release) { uncovered.push(`lens '${lens}': never ran (under reserve)`); return null }
    try {
      const r = await agent(
        `You are a single-lens surveyor of this repository. YOUR LENS: ${lens}.
         ${CATALOGUE[lens]}
         Review ONLY through that lens — other surveyors hold the other concerns, and a finding
         outside yours is theirs to make, not yours to guess at.
         ${args.scope ? `Scope: ${args.scope.join(', ')}.` : 'Scope: the whole repository, but weight what is load-bearing — code that handles money, data, auth or external input first.'}
         ${houseRules ? `HOUSE RULES (already distilled — judge against these):\n${houseRules}`
                      : `Read the repo's own docs (README, ADRs, guidelines) and its build/lint config FIRST, and judge against what they state.`}
         Every candidate needs EVIDENCE: the command you ran and its real output, or the exact
         path:line you read. A candidate whose evidence is "this looks wrong" will be refuted, and
         should be. Give 'cost' as what it actually costs someone — a defect it permits, an hour it
         adds to the next change, a rule it breaks — never "it is unclean".
         Effort is yours to estimate: S = a focused edit, M = a session, L = a day or more,
         XL = a project. Be honest; an L reported as S is how a cleanup eats a week.
         ${args.chronicleDir ? `Keep a chronicle at ${args.chronicleDir}/sweep-${lens}.md as you go.` : ''}
         ${NO_FIX} ${NO_SPAWN}
         Return {candidates: [...]}; empty is a fine answer for a clean lens.`,
        { label: `lens:${lens}`, phase: 'Lenses', model: args.tiers?.lens ?? 'sonnet',
          schema: CANDIDATES, ...(args.isolate ? { isolation: 'worktree' } : {}) })
      // Silence is not a clean lens. Without this the concern reads as examined-and-fine, which is
      // the most expensive lie a survey can tell.
      if (!r) { uncovered.push(`lens '${lens}': surveyor died — that concern is unexamined`); return null }
      return (r.candidates ?? []).map(c => ({ ...c, lens }))
    } finally { release() }
  })(),
  (found) => parallel((found ?? []).map(c => () => (async () => {
    const release = claim_(1)
    if (!release) { uncovered.push(`verify "${c.title}": never ran (under reserve)`); return null }
    try {
      const v = await agent(
        `Refute this survey candidate. You are trying to KILL it.
         Candidate: ${JSON.stringify(c)}
         ${houseRules ? `House rules:\n${houseRules}` : ''}
         Read the code yourself; do not trust the summary. Attack it:
         - Is the problem actually there, at that path, on the real inputs that reach it?
         - Is the COST real, or is this taste? "Not how I would write it" is refuted. So is a
           warning that is deliberately baselined, a duplication that is two rules that merely look
           alike, and an "untested" path that is covered by a test elsewhere — go and look.
         - For architecture drift: does the repo's own documentation actually state the rule being
           broken, or was it assumed? An unstated rule is not drift, it is a proposal.
         - Is a guard, a caller, a config or an existing test already preventing the failure?
         - Is the effort estimate credible once you have read the surrounding code? Correct it if not.
         Default to refuted:true when the evidence does not hold up. If it survives, set
         refuted:false and 'proof': a command and its output, or the exact path:line.
         ${NO_FIX} ${NO_SPAWN}`,
        { label: `verify:${norm(c.title).slice(0, 24)}`, phase: 'Verify',
          model: args.tiers?.verify ?? 'sonnet', schema: VERDICT,
          ...(args.isolate ? { isolation: 'worktree' } : {}) })
      if (!v) { uncovered.push(`verify "${c.title}": verifier died — candidate unjudged`); return null }
      if (v.refuted) { refuted.push(`[${c.lens}] ${c.title} — ${v.why}`); return null }
      return { ...c, severity: v.severity ?? c.severity, effort: v.effort ?? c.effort, proof: v.proof ?? c.evidence }
    } finally { release() }
  })()))
)

const seen = new Set()
const candidates = []
for (const c of perLens.filter(Boolean).flat().filter(Boolean)) {
  const k = key(c)
  if (seen.has(k)) continue                    // lenses overlap: a duplicated god-function is both
  seen.add(k)
  candidates.push(c)
}
candidates.sort((a, b) => RANK[a.severity] - RANK[b.severity])
const withIds = candidates.map((c, i) => ({ id: `S${i + 1}`, ...c }))

// ---------------------------------------------------------------------------
// Phase 4 — Plan. THE BARRIER IS EARNED HERE and nowhere else: grouping needs every candidate at
// once. Nine lenses each report a symptom of one cause — the same god-class shows up as a smell, a
// coverage gap, a duplication and a layering violation — and a per-lens plan would hand the human
// four tickets for one afternoon of work.
// ---------------------------------------------------------------------------
phase('Plan')
let plan = null
if (withIds.length) {
  const release = claim_(1)
  if (!release) {
    uncovered.push('planning never ran (under reserve) — candidates are returned ungrouped and unsized')
  } else {
    try {
      plan = await agent(
      `Here is every VERIFIED candidate from a repository sweep, found by single-lens surveyors who
       could not see each other's work:
       ${JSON.stringify(withIds, null, 1)}

       Turn it into a plan a human can decide on in five minutes.
       1. GROUP by underlying cause, not by lens. Several candidates are usually one piece of work;
          say so and list the ids each item covers. Every candidate id must appear in exactly one item.
       2. SIZE each item honestly (S/M/L/XL) and give its risk of breaking something (low/medium/high).
       3. ORDER: name dependencies. Formatting and lint-config work goes FIRST or it buries every
          later diff in noise. Test coverage goes BEFORE the refactor it is supposed to protect —
          a refactor landing on untested code is how a cleanup causes the outage.
       4. RECOMMEND, per item: 'now' (small, low-risk, self-contained — worth doing in this session),
          'ticket' (real work needing its own review, or judgement this run should not make alone),
          'drop' (true but not worth the churn — say that plainly rather than filing it to be
          ignored forever; a backlog full of nobody's-doing-that is worse than a short one).
       You are RECOMMENDING. A human picks. Do not fix anything and do not file anything.
       ${NO_SPAWN}`,
      { label: 'plan', phase: 'Plan', model: args.tiers?.plan ?? 'sonnet', schema: PLAN })
    } finally { release() }
    if (!plan) uncovered.push('planner died — candidates are returned ungrouped and unsized')
  }
}

// A candidate the planner forgot would silently vanish between the survey and the human. Cheap to
// check here, invisible if it is not checked at all.
const covered = new Set((plan?.items ?? []).flatMap(i => i.covers ?? []))
const unplanned = withIds.filter(c => !covered.has(c.id)).map(c => c.id)
if (plan && unplanned.length) uncovered.push(`planner omitted ${unplanned.length} candidate(s): ${unplanned.join(', ')}`)

say(`sweep: ${withIds.length} verified candidates, ${refuted.length} refuted, ${(plan?.items ?? []).length} work items`)

return {
  candidates: withIds,
  plan: plan?.items ?? [],
  refuted,
  lensesRun: lenses,
  uncovered,
  // Nothing was changed and nothing was filed — the conductor owns both of those decisions.
  complete: uncovered.length === 0,
}
