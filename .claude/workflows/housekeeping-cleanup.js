export const meta = {
  name: 'housekeeping-cleanup',
  description: 'Apply adjudicated documentation dispositions — one editor per file, each edit re-checked by a second agent that never made it',
  phases: [{ title: 'Edit' }, { title: 'Check' }],
}
// args: { startedAt: '08-15 21:04',
//         dispositions: [{ id: 'D3', doc: 'README.md', action: 'fix-doc',
//                          instruction: 'the retry count is 5, not 3 — correct the paragraph',
//                          sourceOfTruth: 'code', proof: 'src/http.ts:88' }, ...],
//         reserve: 40000, chronicleDir: '.agents/housekeeping/chronicles',
//         tiers: { edit: 'sonnet', check: 'sonnet' } }
//
// THE SECOND HALF of housekeeping-audit.js, and deliberately a SEPARATE DISPATCH: a human
// adjudicates the audit's findings in between, and this script acts only on what came back from
// that. It cannot discover work of its own — there is no search here, no auditor, no "while I was
// in this file I also noticed". An editor that finds its own work is an editor nobody approved.
//
// WHAT THIS SCRIPT CANNOT DO, by absence of a code path rather than by instruction:
//   - touch code (only ACTIONS below are executable, and none of them edit source)
//   - touch an external system (Confluence, Jira, Azure DevOps) — those are authoritative and
//     read-only; a disposition pointing at a URL is rejected, not attempted
//   - commit, push, open a PR, or post anything
// The conductor reviews the working tree afterwards. That is the point at which a human sees the
// diff, and it is the last cheap moment to disagree with a deletion.

if (typeof args === 'string') args = JSON.parse(args)

const startedAt = args.startedAt || ''
const say = (m) => log(startedAt ? `[${startedAt}] ${m}` : m)

// The write allowlist. Everything the audit can propose that is NOT here — 'file-ticket',
// 'ask-human', 'keep', 'fix-code' — is skipped WITH ITS REASON rather than interpreted. An editor
// improvising an action it was not given is exactly the failure this list exists to prevent.
const ACTIONS = ['fix-doc', 'rewrite-doc', 'delete-doc', 'supersede-adr']

const RESULT = { type: 'object', properties: {
  results: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', minLength: 1 },
    done: { type: 'boolean' },
    what: { type: 'string', minLength: 1 },        // what was actually changed, concretely
    why: { type: ['string', 'null'] } },           // required reading when done=false
    required: ['id', 'done', 'what'] } } },
  required: ['results'] }

const CHECK = { type: 'object', properties: {
  ok: { type: 'boolean' },
  problems: { type: 'array', items: { type: 'string' } },
  newClaims: { type: 'array', items: { type: 'string' } } },   // claims the edit ADDED, unasked
  required: ['ok', 'problems'] }

const RESERVE = args.reserve ?? 40000
let committed = 0
const claim_ = n => {
  const need = RESERVE * n
  if (budget.total && budget.remaining() - committed < need) return false
  committed += need
  return () => { committed -= need }
}

const NO_SPAWN = `You are the ONLY agent on your task. You have no Agent, Task or Workflow tool — do
NOT delegate or spawn; anything that appears to work is role-play. Do the work yourself.`

const skipped = []      // never attempted, and why — the conductor must be able to see each one
const failed = []       // attempted and did not hold up — needs a human

// ---------------------------------------------------------------------------
// Admission. Every rejection here is a case where guessing would be worse than stopping.
// ---------------------------------------------------------------------------
const admitted = []
for (const d of args.dispositions ?? []) {
  if (!d || !d.id) { skipped.push({ id: d?.id ?? '(no id)', why: 'no id — cannot be reported back against the audit' }); continue }
  if (!ACTIONS.includes(d.action)) { skipped.push({ id: d.id, why: `action '${d.action}' is not an executable cleanup action (${ACTIONS.join(', ')}) — it belongs to the conductor, not this script` }); continue }
  if (!d.doc || /^[a-z][a-z0-9+.-]*:\/\//i.test(d.doc)) { skipped.push({ id: d.id, why: `target '${d.doc}' is not a repo-relative path — external and authoritative sources are read-only` }); continue }
  if (!d.instruction) { skipped.push({ id: d.id, why: 'no instruction — an editor left to infer the edit writes a different one' }); continue }
  // A deletion without a named source of truth is the single most expensive mistake available here.
  if (d.action === 'delete-doc' && !d.sourceOfTruth) { skipped.push({ id: d.id, why: 'delete-doc with no sourceOfTruth — nothing would be left holding the claim this document holds' }); continue }
  admitted.push(d)
}
if (skipped.length) say(`admission: ${skipped.length} disposition(s) skipped, ${admitted.length} admitted`)
if (!admitted.length) return { applied: [], skipped, failed, files: [], complete: skipped.length === 0 }

// GROUP BY FILE. Two agents editing one document in parallel is a lost edit — the second writes
// over a file it read before the first was done. One editor owns a file and applies all of its
// dispositions in order; parallelism is across files, where it is safe.
const byFile = new Map()
for (const d of admitted) {
  if (!byFile.has(d.doc)) byFile.set(d.doc, [])
  byFile.get(d.doc).push(d)
}
const files = [...byFile.entries()]
say(`cleanup: ${admitted.length} dispositions across ${files.length} files`)

// ---------------------------------------------------------------------------
// Edit, then Check — a pipeline, so a file is being checked while others are still being edited.
// The checker is a DIFFERENT agent that never saw the editor's reasoning: an editor asked whether
// its own edit was faithful says yes, and means it.
// ---------------------------------------------------------------------------
phase('Edit')
const perFile = await pipeline(
  files,
  ([doc, items]) => (async () => {
    const release = claim_(1)
    if (!release) { items.forEach(d => skipped.push({ id: d.id, why: 'editor never ran (under reserve)' })); return null }
    try {
      const r = await agent(
        `Apply these ADJUDICATED documentation dispositions to ONE file: ${doc}
         A human reviewed and approved each of them. Apply exactly these and NOTHING else.

         ${items.map(d => `- [${d.id}] ${d.action}: ${d.instruction}
           source of truth: ${d.sourceOfTruth ?? 'unstated'}${d.proof ? ` (${d.proof})` : ''}`).join('\n')}

         Read the file in full first, and read the code the disposition cites, so the replacement
         text is true rather than merely different. Then:
         - fix-doc / rewrite-doc: change the wrong part. Do not restyle, reorder or "improve" the
           rest — an unrequested edit in this diff costs the reviewer the ability to skim it.
         - delete-doc: remove the section, paragraph or comment named. Delete the WHOLE file only
           if the disposition says the file itself is the target. If deleting leaves a dangling
           link or an orphaned heading elsewhere in THIS file, fix that too and say you did.
         - supersede-adr: never rewrite the decision. Mark the ADR superseded per this repo's own
           ADR convention (status line, link to the superseding record) and, if the disposition
           names the replacement, create it in the same format as the repo's existing ADRs.
         Touch NO other file. Touch NO source code. Commit nothing, push nothing, post nothing to
         any external system. If a disposition turns out to be wrong once you read the file — the
         paragraph is not what it was described as, the code says otherwise — DO NOT apply it:
         return done:false with why. That is a correct outcome, not a failure.
         ${args.chronicleDir ? `Note what you changed in ${args.chronicleDir}/cleanup-${String(doc).replace(/[^a-zA-Z0-9]+/g, '-')}.md.` : ''}
         ${NO_SPAWN}
         Return {results: [{id, done, what, why}]} — one entry per disposition above.`,
        { label: `edit:${String(doc).split('/').pop().slice(0, 24)}`, phase: 'Edit',
          model: args.tiers?.edit ?? 'sonnet', schema: RESULT })
      // A dead editor is not a no-op we can assume: it may have written half the file before it
      // died. It goes to failed, which a human reads, not to skipped, which reads as "untouched".
      if (!r) { items.forEach(d => failed.push({ id: d.id, doc, why: 'editor died mid-edit — the file may be partially changed; check the diff' })); return null }
      return { doc, items, results: r.results ?? [] }
    } finally { release() }
  })(),
  (edited) => (async () => {
    if (!edited) return null
    const done = edited.results.filter(r => r.done)
    edited.results.filter(r => !r.done).forEach(r => skipped.push({ id: r.id, why: r.why || 'the editor declined it after reading the file' }))
    if (!done.length) return { ...edited, check: null }
    const release = claim_(1)
    if (!release) { done.forEach(r => failed.push({ id: r.id, doc: edited.doc, why: 'edit applied but never checked (under reserve) — review the diff yourself' })); return { ...edited, check: null } }
    try {
      const c = await agent(
        `Check an edit you did not make. File: ${edited.doc}
         What was APPROVED:
         ${edited.items.map(d => `- [${d.id}] ${d.action}: ${d.instruction}`).join('\n')}
         What the editor reports doing:
         ${done.map(r => `- [${r.id}] ${r.what}`).join('\n')}

         Read the file as it now stands, and \`git diff -- ${edited.doc}\` (plus \`git status\` for
         a deleted file). Answer three questions, in this order of importance:
         1. Did the edit ADD any claim nobody approved? List each in 'newClaims'. A cleanup that
            invents a fresh assertion has created new drift while removing old drift, and it is the
            failure mode of this whole phase because it looks like success in the report.
         2. Is what is now written TRUE against the source of truth cited? Go and read that code.
         3. Was anything changed beyond the approved dispositions — reflow, restyle, reordering,
            an unrelated fix? Say so; scope creep in a documentation diff is how a real regression
            rides in unreviewed.
         ok:true only if all three are clean. Otherwise list the problems concretely.
         Edit NOTHING yourself — you are the check, not a second editor. ${NO_SPAWN}`,
        { label: `check:${String(edited.doc).split('/').pop().slice(0, 24)}`, phase: 'Check',
          model: args.tiers?.check ?? 'sonnet', schema: CHECK })
      if (!c) { done.forEach(r => failed.push({ id: r.id, doc: edited.doc, why: 'checker died — the edit is applied but unverified; review the diff yourself' })); return { ...edited, check: null } }
      if (!c.ok) done.forEach(r => failed.push({ id: r.id, doc: edited.doc, why: [...(c.problems ?? []), ...(c.newClaims ?? []).map(n => `unapproved new claim: ${n}`)].join('; ') || 'the checker rejected the edit' }))
      return { ...edited, check: c }
    } finally { release() }
  })()
)

const failedIds = new Set(failed.map(f => f.id))
const applied = perFile.filter(Boolean).flatMap(e => e.results.filter(r => r.done && !failedIds.has(r.id))
  .map(r => ({ id: r.id, doc: e.doc, what: r.what })))

say(`cleanup: ${applied.length} applied, ${failed.length} need a human, ${skipped.length} skipped`)

return {
  applied,
  skipped,                                    // never attempted — each with the reason
  failed,                                     // attempted, not verified clean — a human must look
  files: [...new Set(perFile.filter(Boolean).map(e => e.doc))],
  // Nothing was committed. Saying so in the return keeps the conductor from reporting a cleanup as
  // landed when it is sitting in the working tree.
  committed: false,
  complete: failed.length === 0 && skipped.length === 0,
}
