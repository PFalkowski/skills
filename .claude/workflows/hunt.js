export const meta = {
  name: 'nights-watch-hunt',
  description: 'Hunt critical bugs and vulnerabilities in the delta since the last hunt; refute every candidate',
  phases: [{ title: 'Hunters' }, { title: 'Refuters' }],
}
// Some hosts deliver `args` as an unparsed JSON string rather than the object the contract
// promises; this is a no-op when args already arrives parsed.
if (typeof args === 'string') args = JSON.parse(args)
// args: { range: 'abc123..def456',                      // BOTH ends explicit SHAs, never HEAD:
//                                                       // hunters run in worktrees where HEAD differs
//         files: ['src/a.ts', ...], manifests: [...],   // NAMES only (Oath rule 2), capped by the watcher
//         logsCmd: null, visibility: 'public',          // resolved at step 0, before the muster
//         lenses: ['injection', 'authz', ...],          // what the delta can trigger, already budget-planned
//         tiers: { injection: 'sonnet', refute: 'sonnet' },
//         known: { '<fingerprint>': 'high', ... },      // ledger status=reported ONLY — never pending
//         fixed: ['<fingerprint>', ...],                // ledger status=fixed — a reappearance is a regression
//         carry: [{...finding, lens, id, range, attempts}],  // carry.jsonl — found earlier, still unrefuted
//         maxFindings: 8, maxCarry: 24, maxAttempts: 3, reserve: 40000, chronicleDir, libraryIndex }

// The closed vocabulary IS the identity (see § Fingerprints). A model may pick a token; it may
// never phrase one, or the fingerprint drifts and the horn blows twice for one flaw.
const FLAWS = ['unescaped-input-in-query', 'command-injection', 'path-traversal', 'ssrf',
  'unsafe-deserialization', 'template-injection', 'missing-authz-check', 'wrong-authz-scope',
  'idor', 'tenant-leak', 'secret-in-source', 'secret-in-logs', 'vulnerable-dependency',
  'malicious-or-typosquat-dependency', 'widened-version-range', 'install-script-execution',
  'unhandled-failure-path', 'race-condition', 'resource-leak', 'broken-invariant', 'data-loss',
  'widened-permission', 'open-network-surface', 'debug-enabled-in-production',
  'duplicated-logic', 'dead-code', 'god-function', 'leaky-abstraction', 'tangled-coupling',
  'compiler-warning', 'lint-warning', 'deprecated-api-usage', 'other']
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const CANDIDATES = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object',
  properties: { title: {type:'string'}, file: {type:'string', minLength: 1},
    symbol: {type:'string'},                      // '' for non-code files — never invent one
    subject: {type:'string', minLength: 1},       // NEVER empty: two flaws in one symbol differ here
    flaw: {type:'string', enum: FLAWS}, severity: {type:'string', enum: SEVERITIES},
    failurePath: {type:'string'}, evidence: {type:'string'} },
  required: ['title','file','symbol','subject','flaw','severity','failurePath','evidence'] } } },
  required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: {type:'boolean'}, why: {type:'string'},
  severity: {type:['string','null'], enum: [...SEVERITIES, null]}, repro: {type:['string','null']} },
  required: ['refuted','why'] }

const RANK = { critical: 0, high: 1, medium: 2, low: 3 }
const worst = xs => xs.filter(s => RANK[s] !== undefined).sort((a, b) => RANK[a] - RANK[b])[0]
// Colons are the field delimiter, so they must not survive inside a field: a subject like
// `http://internal:8080` would otherwise shift the boundaries of the one string compared exactly.
const norm = s => String(s || '').trim().toLowerCase().replace(/[\s:]+/g, '-')
const sym = s => norm(String(s || '').split('(')[0].split('<')[0].split('.').pop())
// Two different things, and conflating them was a bug: a path OUTSIDE the muster is expected
// (hunters are told to follow callers), a path that is not repo-relative at all is a hunter
// leaking its throwaway worktree. The first is canonicalized and kept; the second is flagged.
const canonFile = p => {
  const q = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const hit = args.files.find(f => { const g = f.replace(/\\/g, '/').toLowerCase()
    return g === q.toLowerCase() || q.toLowerCase().endsWith('/' + g) })
  if (hit) return { file: hit, verified: true }
  const looksRepoRelative = !/^([a-z]:)?\//i.test(q) && !q.includes('..')
  return { file: q, verified: false, malformed: !looksRepoRelative }
}
// The fingerprint IS the key — stored and compared verbatim. No hash: a truncated digest's
// collision silently filters a REAL finding as already-known. See § Fingerprints.
// A malformed path is ephemeral by construction (a worktree dir that never recurs), so putting it
// in the key guarantees a cache miss EVERY hunt — the finding is re-refuted and re-reported hourly,
// forever. Drop the path from the identity instead: symbol+subject+flaw still identifies it, the
// human still gets the raw path in the report, and the duplicate is occasional rather than eternal.
const idKey = f => [f.pathMalformed ? '' : norm(f.canonFile), sym(f.symbol), norm(f.subject), f.flaw].join(':')
const fp = (lens, f) => `${f.flaw === 'other' ? `other:${lens}` : lens}:${idKey(f)}`

// Admission control, not a spend check. `pipeline` starts every lens at once, so a guard that
// reads budget.remaining() sees a counter no concurrent sibling has moved yet and waves them all
// through. Reserving is serialized by JS itself — the concurrent claims see each other.
let committed = 0
const claim = n => {
  const need = (args.reserve ?? 40000) * n
  if (budget.total && budget.remaining() - committed < need) return false
  committed += need
  return () => { committed -= need }   // release once the real spend has landed
}

// Every way an id can be absent from `confirmed` needs a home, because the fire reads absence as
// evidence of a fix. An id that falls out of all of these is one the fire will mark fixed and
// then report as a regression against a fix that never happened.
const uncovered = []    // a lens that never ran (refused OR died) — the ONLY thing that holds the watermark
const deferred = []     // found, not yet refuted — banked to carry.jsonl, does NOT hold the watermark
const stillPresent = [] // known findings re-found unchanged — real, still there, NOT fixed
const refuted = []      // killed by 2+ refuters — never real; not fixed either
const dropped = []      // abandoned after maxAttempts — cut, and said out loud, in prose for the report
const droppedIds = []   // ...and as ids, because the fire needs a set it can test, not a sentence
const ran = new Set()   // lenses whose hunter actually returned — never inferred from silence
const ANGLES = ['reachability: can untrusted input actually reach this, in a real deployment?',
                'blast radius: granted it is real, what does it cost? does a caller already constrain it?',
                'repro: make it happen — a runnable case with its real output, or the exact lines that prove it']

const refute = async f => {
  const release = claim(3)
  if (!release) { deferred.push(f); log(`deferring "${f.title}" unrefuted: under reserve`); return null }
  try {
    const votes = (await parallel(ANGLES.map(angle => () => agent(
      `Refute this finding. Angle — ${angle}
       Finding: ${JSON.stringify(f)}
       It was found in the delta ${f.range ?? args.range} — the range it was FOUND in, which for a
       carried candidate is not this hunt's. Read the code yourself; do not trust the summary.
       You are trying to KILL it. Default to refuted:true when the evidence does not hold up;
       a plausible story is not evidence. If you can produce a real repro, do so and set
       refuted:false with the repro and your own severity call.
       If the code it describes is GONE — fixed or deleted since — refute it and say so plainly in
       your reason: that is a fix, not a bad finding.`,
      { label: `refute:${String(f.id).slice(0, 24)}`, phase: 'Refuters',
        model: args.tiers?.refute ?? 'sonnet', isolation: 'worktree', schema: VERDICT })))).filter(Boolean)
    // Every refuter agent died — infrastructure, not a verdict. Defer it: an unrefuted candidate
    // is not a refuted one, and treating an API failure as "not real" is how a live vulnerability
    // gets marked fixed by a machine that never looked at it.
    if (votes.length === 0) { deferred.push(f); log(`deferring "${f.title}": every refuter died`); return null }
    const kills = votes.filter(v => v.refuted).length
    if (kills >= 2) { refuted.push(f.id); log(`dropped ${f.title} (${kills}/${votes.length} refuted)`); return null }
    const survivors = votes.filter(v => !v.refuted)
    return { ...f, severity: worst(survivors.map(v => v.severity)) ?? f.severity,   // refuted votes don't rate it
             repro: survivors.map(v => v.repro).find(Boolean) ?? null,
             survived: `${survivors.length}/${votes.length}` }
  } finally { release() }
}

// Rule 3 is a COMPARISON, not membership: drop only what the ledger carries as REPORTED at the
// same-or-worse severity. A match that got worse, or a fixed finding come back, is news.
const triage = f => {
  if ((args.fixed || []).includes(f.id)) return { ...f, regression: true }
  const seen = (args.known || {})[f.id]
  if (seen && RANK[f.severity] >= RANK[seen]) { stillPresent.push(f.id); return null }   // known, no worse
  return { ...f, escalation: seen ? `${seen} → ${f.severity}` : null }
}

phase('Hunters')
// Candidates found in an earlier hunt and never refuted. Re-triaged (the ledger moved on while
// they sat in the bank) and bounded: two strikes, like every other retry in the Watch. Both
// bounds say what they cut — a cap nobody hears about is the failure the cap was meant to report.
const eligible = []
for (const f of (args.carry ?? [])) {
  if ((f.attempts ?? 0) >= (args.maxAttempts ?? 3)) {
    dropped.push(`${f.id}: "${f.title}" abandoned after ${f.attempts} attempts — never refuted`)
    droppedIds.push(f.id)
    log(`carry: abandoning "${f.title}" after ${f.attempts} attempts`); continue
  }
  if (eligible.length >= (args.maxCarry ?? 24)) {
    // Deferred, not dropped — and the distinction is the file's whole point one level down:
    // `dropped` is abandoned forever, `deferred` is the rewrite's source set. Putting a
    // re-bank-me candidate in `dropped` would have the fire delete it every hunt while the
    // doc claimed it was banked. It is not refuted this hour; it is not gone.
    deferred.push(f)
    log(`carry: "${f.title}" over maxCarry — re-banked, not refuted this hunt`)
    continue
  }
  eligible.push(f)
}
const carried = await parallel(eligible
  .map(f => triage({ ...f, attempts: (f.attempts ?? 0) + 1 }))   // carried ids come from carry.jsonl
  .filter(Boolean)
  .map(f => () => refute(f)))

const hunted = await pipeline(
  args.lenses,
  async lens => {
    const release = claim(1)
    if (!release) { uncovered.push(`${lens}: lens never ran (under reserve)`); return null }
    try {
      const r = await agent(
        `You are a hunter of the Night's Watch. Lens: ${lens}. Hunt ONLY through that lens.
         Read the Library index at ${args.libraryIndex}; open only entries relevant to this repo's
         conventions and known gotchas. Keep a chronicle at ${args.chronicleDir}/hunt-${lens}.md —
         append the moment you learn something, not at the end.
         Your scope is the delta ${args.range} and nothing else — do NOT audit the repo.
         Run your own \`git diff ${args.range}\` over these files: ${args.files.join(', ')}
         ${args.manifests.length ? `Dependency manifests changed: ${args.manifests.join(', ')}` : ''}
         ${args.logsCmd ? `Runtime errors since the last hunt: run \`${args.logsCmd}\`` : ''}
         Read each changed file IN FULL plus its callers: a diff is dangerous in context, not in
         isolation. A finding may live in a caller that the delta did not touch — report it.
         Truth before all: run the "fact-check" skill before any load-bearing claim enters a finding —
         an advisory's affected range, an API's actual behavior, a version fact. Prove it with a runnable
         experiment + output or independent authoritative sources. Unprovable = false, so drop it.
         A finding needs a FAILURE PATH: the inputs/conditions, and the bad outcome they cause.
         "Looks unsafe" is not a finding. You fix NOTHING — no edits, branches, or commits to the repo.
         Identity fields — these are an IDENTITY, not a description. The same defect must produce the
         same values from any hunter, in any month:
           file    — repo-relative, exactly as \`git ls-files\` prints it. You are in a temporary
                     worktree: never report its absolute path. Verify with
                     \`git ls-files --error-unmatch <path>\` before you report it.
           symbol  — the enclosing function/class. EMPTY STRING for files that have none
                     (package.json, lockfiles, Dockerfiles, CI yaml). Never invent one.
           subject — what the flaw is ABOUT: the package, the credential, the port, the route, the
                     field, the parameter. NEVER empty — two flaws in one symbol are told apart by
                     this alone, so an empty one silently merges them. Terse and exact: 'lodash',
                     not 'the lodash dependency'. If the symbol truly is the subject, name it again.
           flaw    — the ONE token from the vocabulary that names this defect. Reach for 'other'
                     only when nothing fits, and say so in your chronicle: the vocabulary may need a word.
         Return {findings: [...]}; empty is a fine and common answer.`,
        { label: `hunter:${lens}`, phase: 'Hunters', schema: CANDIDATES,
          model: args.tiers?.[lens] ?? 'sonnet',
          effort: (args.tiers?.[lens] ?? 'sonnet') === 'opus' ? 'high' : undefined,
          isolation: 'worktree' })   // hunters run fact-check experiments — never in the user's tree
      // A dead agent returns null. Silence is not a clean hunt: without this the lens stays in
      // `lensesRun`, the watermark advances over a delta it never read, and the fire marks every
      // open finding in its files fixed. Coverage is recorded from what came back, never inferred.
      if (!r) { uncovered.push(`${lens}: hunter died — delta unexamined by this lens`); return null }
      ran.add(lens)
      return r
    } finally { release() }
  },
  async (r, lens) => {
   // Not for a throwing refuter — `parallel()` never rejects (a thunk that throws resolves to
   // null), so that path lands in votes.length===0 → deferred, above. This catches a SYNCHRONOUS
   // throw in the triage below: a malformed payload, a field that isn't what the schema promised.
   // Without it the lens's findings are in no set at all while `ran` — set in stage 1, when the
   // hunter returned — still calls the lens clean, and the fire marks its whole surface fixed.
   // `ran` means the hunter returned; only reaching the end of this stage means it's accounted for.
   try {
    const triaged = []
    for (const f of (r?.findings ?? [])) {
      const cf = canonFile(f.file)
      if (cf.malformed) { log(`${lens}: unusable path "${f.file}" on "${f.title}" — reported, unverified`) }
      // ORDER IS LOAD-BEARING: canonFile → id → triage. `triage()` reads `f.id`, so assigning the
      // id after it silently disables rule 3 for every hunted finding — no dedup, no escalation,
      // an empty `stillPresent`, and the fire marking live findings fixed. It reads fine and it
      // is inert. A unit test of triage() cannot see it; only the return value can.
      const g = { ...f, lens, canonFile: cf.file, pathVerified: cf.verified,
                  pathMalformed: !!cf.malformed, range: args.range }
      g.id = fp(lens, g)
      const t = triage(g)
      if (t) triaged.push(t)
    }
    triaged.sort((a, b) => RANK[a.severity] - RANK[b.severity])
    const cap = args.maxFindings ?? 8
    // Over the cap is DEFERRED, not uncovered: the delta WAS examined, the candidate is banked in
    // carry.jsonl, and the next hunt refutes it from `carry`. Holding the watermark for it would
    // livelock — the same lens would re-find the same overflow every hour, forever.
    if (triaged.length > cap) {
      log(`lens ${lens}: refuting the ${cap} most severe of ${triaged.length}; ${triaged.length - cap} deferred`)
      deferred.push(...triaged.slice(cap))
    }
    return (await parallel(triaged.slice(0, cap).map(f => () => refute(f)))).filter(Boolean)
   } catch (e) {
    // Retract the coverage claim: this lens's findings are unaccounted for, so the watermark must
    // not advance over the delta. Bank what was already triaged rather than losing it.
    ran.delete(lens)
    uncovered.push(`${lens}: stage failed after the hunt (${String(e && e.message || e)}) — findings unaccounted for`)
    return []
   }
  }
)

// Dedup by id: a carried candidate whose file the delta touched is found again by its own lens,
// and one flaw must not be refuted twice, reported twice, or counted as its own corroboration.
const byId = {}
for (const f of [...carried.filter(Boolean), ...hunted.flat().filter(Boolean)]) byId[f.id] ??= f
const confirmed = Object.values(byId)
// Two DISTINCT lenses landing on one defect is the strongest signal a hunt produces — computed,
// not left to the report to notice. A lens agreeing with itself is not corroboration. The key
// drops an ephemeral path for the same reason fp() does: each hunter has its own worktree, so
// two lenses seeing one malformed-path defect would report two absolutes and never group.
const groups = {}
for (const f of confirmed) (groups[idKey(f)] ??= []).push(f)
for (const g of Object.values(groups)) {
  const lenses = [...new Set(g.map(x => x.lens))]
  if (lenses.length > 1) for (const f of g) f.corroborated = lenses
}
confirmed.sort((a, b) => RANK[a.severity] - RANK[b.severity])
return { confirmed, deferred, uncovered, stillPresent, refuted, dropped,
         range: args.range, visibility: args.visibility,
         // Recorded from what came back, not inferred from the absence of complaint.
         lensesRun: [...ran],
         // THE fire's answer, computed here rather than re-derived by an agent from five arrays
         // holding three element types (ids, objects, prose). Producer 2 is one test against this
         // — `!accountedFor.includes(id)` — because "the id is in none of these five" is arithmetic,
         // and prose asked to do arithmetic across mixed types silently answers "not present",
         // which marks live findings fixed. A sixth way to leave `confirmed` joins THIS line.
         accountedFor: [...new Set([...confirmed.map(f => f.id), ...stillPresent, ...refuted,
                                    ...deferred.map(f => f.id), ...droppedIds])],
         complete: uncovered.length === 0 }
