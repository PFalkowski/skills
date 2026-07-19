export const meta = {
  name: 'nights-watch-grill',
  description: 'Grill one PR: fresh adversarial reviewer(s) fanned out BY THE SCRIPT, every finding refute-verified',
  phases: [{ title: 'House rules' }, { title: 'Reviewers' }, { title: 'Verifiers' }],
}
// args: { pr: 42, title: 'fix: ...', url: 'https://...',
//         range: 'abc123..def456',                  // base..head, BOTH explicit SHAs, never HEAD:
//                                                   // reviewers run in worktrees where HEAD differs
//         files: ['src/a.ts', ...],                 // NAMES only (Oath rule 2), capped by the watcher
//         stance: 'single' | 'quorum',
//         concerns: ['security', 'architecture'],   // quorum lenses; ignored for single
//         known: ['src/a.ts:missing-null-check', ...],  // threads already posted on this PR by an
//                                                   // earlier grill — dedup keys, see GRILL.md
//         tiers: { review: 'sonnet', verify: 'sonnet', docs: 'haiku' },
//         reserve: 40000, chronicleDir, libraryIndex }
//
// THE WALL (PFalkowski/skills#46): an agent() running inside a Workflow has no Agent/Task tool and
// no Workflow tool. It cannot spawn anything, and nothing throws when it tries — it role-plays the
// missing subagents and reports success. So EVERYTHING that fans out in this mode fans out HERE, in
// the script, where agent() calls are first-order: the quorum is one agent per concern, blind to
// the others; the verifiers are script-dispatched too. Every prompt below says "do not spawn"
// because the failure mode is silent, and this script calls no workflow() — the one level of
// nesting the Watch budgets is already spent getting here.

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'nit']
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object',
  properties: { title: {type:'string', minLength: 1},
    file: {type:'string', minLength: 1},          // repo-relative, exactly as the diff names it
    line: {type:'integer', minimum: 1},           // line in the file AT THE PR HEAD — threads anchor here
    severity: {type:'string', enum: SEVERITIES},
    failureScenario: {type:'string', minLength: 1},   // inputs/state → wrong outcome; nits name the cost
    evidence: {type:'string', minLength: 1},
    suggestion: {type:['string','null']} },
  required: ['title','file','line','severity','failureScenario','evidence'] } } },
  required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: {type:'boolean'}, why: {type:'string'},
  severity: {type:['string','null'], enum: [...SEVERITIES, null]}, proof: {type:['string','null']} },
  required: ['refuted','why'] }

const RANK = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 }
const norm = s => String(s || '').trim().toLowerCase().replace(/[\s:]+/g, '-')
// Dedup key: file + title, no line number — line numbers shift between the shas of successive
// grills, and the cost of the looser key is a merged near-duplicate, while a line-tight key would
// re-post every standing finding after every push. Drift in the title costs a duplicate thread —
// waste, never silence.
const key = f => `${norm(f.file)}:${norm(f.title)}`

// Admission control, not a spend check — same reasoning as hunt.js: the fan-outs below start every
// agent at once, so a guard reading budget.remaining() after the fact waves the whole wave through.
let committed = 0
const claim = n => {
  const need = (args.reserve ?? 40000) * n
  if (budget.total && budget.remaining() - committed < need) return false
  committed += need
  return () => { committed -= need }
}

// Every way a finding can avoid `findings` needs a home the watcher can test — absence must never
// read as "reviewed clean". `uncovered` is the only one that blocks the grilled-ledger entry.
const uncovered = []    // a reviewer that never ran (under reserve OR died) — the PR is NOT grilled
const refuted = []      // killed by the verifier — never real; titles, for the report
const alreadyPosted = []// matched args.known — a thread from an earlier grill already stands
const ran = new Set()   // concerns whose reviewer actually returned — never inferred from silence

const NO_SPAWN = `You are the ONLY agent on your task. You have no Agent, Task, or Workflow tool —
do NOT try to convene reviewers, spawn subagents, or delegate; anything that appears to work is
role-play, and role-played independence is the defect this whole mode exists to prevent. Do the
work yourself, in this context. You post NOTHING to the PR and edit NOTHING — return findings.`

phase('House rules')
// code-review-grill's step: the diff is judged against the project's documented architecture.
// One cheap agent distils the house rules once, instead of every reviewer paying to rediscover
// them. If it dies, reviewers are told to read the docs themselves — degraded is disclosed.
const houseRules = await agent(
  `Read this repository's own documentation — README, docs/adr or any ADRs, CONTRIBUTING,
   coding guidelines, architecture notes — and distil the HOUSE RULES a code reviewer must judge
   a diff against: the architecture style, layering rules, naming/idiom conventions, testing
   expectations, and any documented decisions a change could violate. Also read the Library index
   at ${args.libraryIndex} and fold in entries about this repo's conventions and gotchas.
   Return a terse rulebook (aim under 40 lines). ${NO_SPAWN}`,
  { label: 'house-rules', phase: 'House rules', model: args.tiers?.docs ?? 'haiku' })
if (!houseRules) log('house-rules agent died — each reviewer will read the docs itself')

const grillPrompt = concern =>
  `You are a FRESH adversarial reviewer of the Night's Watch — you never saw the author's
   rationale and you are not here to be agreeable. Grill PR #${args.pr} ("${args.title}").
   ${concern ? `YOUR LENS: ${concern}. Review ONLY through it — other reviewers cover the other
   concerns; a finding outside your lens is theirs to make, not yours to guess at.` : ''}
   Use the "code-review-grill" skill with its human gates pre-decided — do NOT ask, do NOT skip
   the skill because you cannot ask: stance is decided (you are the single reviewer for this
   task), and posting is decided (post nothing — the watcher owns the channel; return findings).
   Run your own \`git diff ${args.range}\` — both ends are explicit SHAs; never diff against HEAD,
   you are in a temporary worktree where HEAD is not the PR. Changed files: ${args.files.join(', ')}.
   Go hunk by hunk: what must be true for this to be correct? What input breaks it? What caller
   relied on the old behaviour? Read changed files IN FULL plus their callers.
   ${houseRules ? `HOUSE RULES (already distilled — judge the diff against these):\n${houseRules}`
                : `Read the repo's own docs (README, ADRs, guidelines) FIRST and judge the diff
   against its documented architecture.`}
   Truth before all: fact-check any load-bearing external claim (an API contract, a library
   behaviour) before it enters a finding. Keep a chronicle at
   ${args.chronicleDir}/grill-${args.pr}${concern ? `-${concern}` : ''}.md as you go.
   Report EVERYTHING that holds up, nits included — severity says how much it matters; the
   verifier decides what survives. Every finding anchors to a line: 'file' repo-relative exactly
   as the diff names it, 'line' the line number AT THE PR HEAD (${String(args.range).split('..')[1]})
   where a review thread should hang. A finding needs a concrete failureScenario — for a nit,
   the cost it imposes ("the next reader must...", "this drifts from the documented idiom...").
   ${NO_SPAWN}
   Return {findings: [...]}; empty is a fine answer for a clean diff.`

phase('Reviewers')
// THE QUORUM IS THE SCRIPT'S TO CONVENE (same fix as sdlc-workhorse's review stage and #46):
// one first-order agent() per concern, each blind to the others. A reviewer told "you are a
// quorum" role-plays three voices in one context and the independence is silently gone.
const lenses = args.stance === 'quorum' ? (args.concerns ?? []) : [null]
const reviews = await parallel(lenses.map(concern => () => (async () => {
  const release = claim(1)
  if (!release) { uncovered.push(`${concern ?? 'review'}: reviewer never ran (under reserve)`); return null }
  try {
    const r = await agent(grillPrompt(concern),
      { label: concern ? `grill:${concern}` : 'grill', phase: 'Reviewers',
        model: args.tiers?.review ?? 'sonnet', schema: FINDINGS,
        isolation: 'worktree' })   // reviewers run diffs and repro experiments — never in the user's tree
    // A dead agent returns null, and silence is not a clean review: without this the concern
    // would look covered, the ledger would mark the PR grilled, and the gate ran degraded.
    if (!r) { uncovered.push(`${concern ?? 'review'}: reviewer died — diff unexamined`); return null }
    ran.add(concern ?? 'review')
    return (r.findings ?? []).map(f => ({ ...f, concern: concern ?? 'review' }))
  } finally { release() }
})()))

// Merge, then drop exact restatements (lenses overlap) and threads already standing on the PR
// from an earlier grill. Both are comparisons on the same key; only the second is cross-run.
const known = new Set(args.known ?? [])
const seen = new Set()
const candidates = []
for (const f of reviews.filter(Boolean).flat()) {
  const k = key(f)
  if (known.has(k)) { alreadyPosted.push(f.title); continue }
  if (seen.has(k)) continue
  seen.add(k)
  candidates.push(f)
}

phase('Verifiers')
// Every finding faces one adversarial verifier before any human reads it — the finder is the
// last to notice its own finding is theatre. Nits are verified too: the user asked for every
// survivor posted, which makes the verifier the only floor there is.
const verified = await parallel(candidates.map(f => () => (async () => {
  const release = claim(1)
  if (!release) { uncovered.push(`verify:"${f.title}" never ran (under reserve)`); return null }
  try {
    const v = await agent(
      `Refute this code-review finding. Finding: ${JSON.stringify(f)}
       It is about PR #${args.pr}, diff ${args.range} — both ends explicit SHAs; read the code
       yourself, do not trust the summary. You are trying to KILL it: is the claim actually true
       at that line, does the failure scenario actually follow, does a caller or a guard upstream
       already prevent it? Default to refuted:true when the evidence does not hold up.
       If it holds, set refuted:false, your own severity call, and 'proof': a runnable snippet
       with its output, the exact in-repo lines, or an authoritative reference. ${NO_SPAWN}`,
      { label: `verify:${norm(f.title).slice(0, 24)}`, phase: 'Verifiers',
        model: args.tiers?.verify ?? 'sonnet', schema: VERDICT, isolation: 'worktree' })
    // A dead verifier is not a verdict: an unverified finding must not post (the skill's rule —
    // speculation is not a finding) and must not vanish either. It blocks the ledger entry so
    // the next grill re-finds and re-verifies it.
    if (!v) { uncovered.push(`verify:"${f.title}" verifier died — finding unjudged`); return null }
    if (v.refuted) { refuted.push(`${f.title} — ${v.why}`); log(`refuted: ${f.title}`); return null }
    return { ...f, severity: v.severity ?? f.severity, proof: v.proof ?? f.evidence, key: key(f) }
  } finally { release() }
})()))

const findings = verified.filter(Boolean).sort((a, b) => RANK[a.severity] - RANK[b.severity])
return { findings, refuted, alreadyPosted, uncovered,
         pr: args.pr, range: args.range,
         // Recorded from what came back, never inferred from the absence of complaint.
         concernsRun: [...ran],
         // The grilled-ledger gate: the watcher records <pr> <head-sha> only when this is true.
         // A reviewer or verifier that never ran means the PR was NOT grilled at this sha —
         // an un-run gate must stay visible, so the next tick re-grills instead of moving on.
         complete: uncovered.length === 0 }
