export const meta = {
  name: 'housekeeping-audit',
  description: 'Audit documentation against the code and the authoritative externals: drift, bloat, gaps and contradictions, every finding refute-verified',
  phases: [{ title: 'Inventory' }, { title: 'Externals' }, { title: 'Audit' }, { title: 'Verify' }, { title: 'Consolidate' }],
}
// args: { startedAt: '08-15 21:04',              // the conductor's clock — there is none in here
//         paths: ['docs/**', 'README.md'],       // null → the inventory agent finds the docs itself
//         includeComments: true,                 // treat code comments as documentation too
//         externals: [{ name: 'Confluence: Platform space', how: 'mcp__atlassian__search or the URL' }],
//         maxShards: 6, perShard: 8, maxFindingsPerShard: 25,
//         reserve: 40000, chronicleDir: '.housekeeping/chronicles', libraryIndex: null,
//         tiers: { inventory: 'haiku', audit: 'sonnet', verify: 'sonnet', consolidate: 'sonnet' } }
//
// THIS SCRIPT IS READ-ONLY BY CONSTRUCTION. There is no edit, delete, commit, or post code path in
// it, and every prompt says so. That is deliberate and it is the whole reason the audit is safe to
// run wide: a documentation sweep that can also *fix* what it finds will quietly delete a doc whose
// audience it never understood. Cleanup happens in housekeeping-cleanup.js, and only against
// dispositions a human adjudicated in between.
//
// THE WALL (PFalkowski/skills#46): an agent() running inside a Workflow has no Agent, Task or
// Workflow tool. It cannot spawn, and NOTHING THROWS when it tries — it role-plays the subagents
// and reports success. So every fan-out is the script's: one agent per shard, one verifier per
// finding, all first-order agent() calls.

// Some hosts deliver `args` as an unparsed JSON string rather than the object the contract
// promises; a no-op when it already arrives parsed, and without it every args.* read is undefined
// and the audit silently examines nothing.
if (typeof args === 'string') args = JSON.parse(args)

const startedAt = args.startedAt || ''
const say = (m) => log(startedAt ? `[${startedAt}] ${m}` : m)

// The taxonomy is load-bearing, not vocabulary. Each kind has a DIFFERENT remedy, and collapsing
// them is how a sweep ends up deleting a stale-but-needed contract doc (drift, → fix it) with the
// same stroke as a paragraph restating a function body (bloat, → delete it). See DOC-TRIAGE.md.
const KINDS = ['drift', 'bloat', 'gap', 'contradiction', 'orphan']
// Which artifact wins WHEN THEY DISAGREE — decided per claim, never per document.
const SOT = ['code', 'tests', 'external', 'adr', 'human']
// Note what is absent: no 'delete-code', no 'edit-external'. An action the cleanup script has no
// path for must not be proposable here, or the report promises something nothing will do.
const ACTIONS = ['fix-doc', 'rewrite-doc', 'delete-doc', 'supersede-adr', 'file-ticket', 'keep', 'ask-human']

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object',
  properties: {
    kind: { type: 'string', enum: KINDS },
    doc: { type: 'string', minLength: 1 },              // repo-relative path (a code file, for a comment finding)
    docLine: { type: ['integer', 'null'], minimum: 1 },
    claim: { type: 'string', minLength: 1 },            // what the documentation asserts, quoted or close to it
    reality: { type: 'string', minLength: 1 },          // what is actually true, and where that was checked
    codeAnchor: { type: ['string', 'null'] },           // path:line the reality was read at
    sourceOfTruth: { type: 'string', enum: SOT },
    action: { type: 'string', enum: ACTIONS },
    instruction: { type: 'string', minLength: 1 },      // what cleanup would do, concretely enough to execute
    effort: { type: 'string', enum: ['S', 'M', 'L'] },  // L is a ticket, never an inline cleanup
    evidence: { type: 'string', minLength: 1 } },
  required: ['kind', 'doc', 'claim', 'reality', 'sourceOfTruth', 'action', 'instruction', 'effort', 'evidence'] } } },
  required: ['findings'] }

const VERDICT = { type: 'object', properties: {
  refuted: { type: 'boolean' },
  why: { type: 'string', minLength: 1 },
  sourceOfTruth: { type: ['string', 'null'], enum: [...SOT, null] },   // the verifier may correct it
  action: { type: ['string', 'null'], enum: [...ACTIONS, null] },
  proof: { type: ['string', 'null'] } },
  required: ['refuted', 'why'] }

const INVENTORY = { type: 'object', properties: { docs: { type: 'array', items: { type: 'object',
  properties: {
    path: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['readme', 'adr', 'prd', 'runbook', 'guide', 'api-reference', 'comments', 'other'] },
    area: { type: 'string', minLength: 1 },     // the code area it claims to describe — the shard key
    describes: { type: 'string' } },
  required: ['path', 'type', 'area'] } } },
  required: ['docs'] }

const norm = s => String(s || '').trim().toLowerCase().replace(/[\s:]+/g, '-')
// Dedup key: document + kind + the claim, not the line — line numbers move under every edit, and a
// looser key costs a merged near-duplicate while a tight one re-reports the same paragraph forever.
const key = f => `${norm(f.doc)}:${f.kind}:${norm(f.claim).slice(0, 60)}`

// Admission control, not a spend check. The fan-outs below start every agent at once, so a guard
// that reads budget.remaining() after dispatch waves the whole wave through.
let committed = 0
const RESERVE = args.reserve ?? 40000
const claim_ = n => {
  const need = RESERVE * n
  if (budget.total && budget.remaining() - committed < need) return false
  committed += need
  return () => { committed -= need }
}

// Every way a finding can fail to exist needs a home the conductor can read. Absence must never be
// reported as "the docs are clean" — that is the one output that makes the whole run worse than
// not running it, because it retires a suspicion without having checked.
const uncovered = []

const NO_SPAWN = `You are the ONLY agent on your task. You have no Agent, Task or Workflow tool — do
NOT try to convene reviewers, spawn subagents or delegate; anything that appears to work is
role-play. Do the work yourself, in this context.`
const READ_ONLY = `You are AUDITING, not fixing. Edit NOTHING, delete NOTHING, commit NOTHING, post
NOTHING — not the repo's docs, not the code, and above all not any external system (Confluence,
Jira, Azure DevOps, a wiki): those are authoritative sources of context, read-only, and writing to
one is out of bounds even if you are certain it is wrong. Return findings.`

// ---------------------------------------------------------------------------
// Phase 1 — Inventory. One cheap agent maps the documentation surface and, for each artifact, the
// code area it claims to describe. That area is the SHARD KEY: a shard holding a README and the ADR
// it contradicts can see the contradiction, and one that splits them cannot see it at any price.
// ---------------------------------------------------------------------------
phase('Inventory')
const inv = await agent(
  `Inventory this repository's documentation surface.
   ${args.paths ? `Scope: ${args.paths.join(', ')}.` : 'Find it yourself: READMEs at every level, docs/, ADRs, PRDs, runbooks, CONTRIBUTING, architecture notes, guides, generated API references, and any doc-like file outside those conventions.'}
   ${args.includeComments === false ? 'Skip code comments.' : `ALSO treat code comments as documentation: list the source files carrying substantive prose comments (file/class/module headers, block comments explaining behaviour or rationale). Do not list every line comment — list the files where comment prose is dense enough to drift, up to the 20 densest.`}
   For each artifact give: path, type, and 'area' — the code area it claims to describe, named
   consistently across artifacts (e.g. 'auth', 'billing', 'build-and-release', 'repo-wide') so that
   artifacts describing the SAME area share the exact same area string. This grouping is the point
   of the task: two documents about one area must land together.
   ${READ_ONLY} ${NO_SPAWN}`,
  { label: 'inventory', phase: 'Inventory', model: args.tiers?.inventory ?? 'haiku', schema: INVENTORY })

if (!inv || !(inv.docs ?? []).length) {
  // No inventory means no shards, and an empty findings array here would read as "documentation is
  // clean". Stop instead, and say which it was.
  say(inv ? 'inventory found no documentation — nothing to audit' : 'inventory agent died — audit did not run')
  return { findings: [], inventory: [], externals: [], refuted: [],
           uncovered: [inv ? 'inventory found no documentation artifacts' : 'inventory agent died — no shards were built'],
           complete: false }
}

const docs = inv.docs
say(`inventory: ${docs.length} documentation artifacts across ${new Set(docs.map(d => d.area)).size} areas`)

// ---------------------------------------------------------------------------
// Phase 2 — Externals. The authoritative sources are read once, into a digest every shard carries,
// rather than re-fetched by each shard: they are slow, often rate-limited, and each extra reader is
// another chance for one to be written to by accident.
// ---------------------------------------------------------------------------
phase('Externals')
const externals = await parallel((args.externals ?? []).map(src => () => (async () => {
  const release = claim_(1)
  if (!release) { uncovered.push(`external "${src.name}": never read (under reserve) — its claims were not checked`); return null }
  try {
    const d = await agent(
      `Read the authoritative external source "${src.name}" (${src.how ?? 'find it: an MCP tool, the CLI, or the URL'})
       and digest what it AUTHORITATIVELY establishes about this system: intended behaviour,
       requirements and acceptance criteria, decisions taken, ownership, SLAs, deadlines, and
       anything the repo's own documentation would be wrong to contradict.
       Quote or cite each claim with its ticket id / page title / URL so a later reader can check it.
       This source is READ-ONLY and authoritative: you are NOT here to correct it, comment on it,
       transition a ticket, or update a page. Read and report.
       If you cannot reach it, say exactly that — do not reconstruct its contents from the repo,
       which would launder a repo claim into an authoritative one. ${NO_SPAWN}`,
      { label: `external:${norm(src.name).slice(0, 20)}`, phase: 'Externals', model: args.tiers?.audit ?? 'sonnet' })
    if (!d) { uncovered.push(`external "${src.name}": reader died — its claims were not checked`); return null }
    return { name: src.name, digest: d }
  } finally { release() }
})()))
const externalDigest = externals.filter(Boolean)
if ((args.externals ?? []).length) say(`externals: ${externalDigest.length}/${args.externals.length} sources read`)

// ---------------------------------------------------------------------------
// Sharding. Areas are packed into shards, largest area first, so an area is never split across two
// auditors. The shard count is DYNAMIC: bounded by maxShards, by the docs there actually are, and
// by what the remaining budget can pay for — a fixed fan-out either wastes agents on a small repo
// or under-covers a large one.
// ---------------------------------------------------------------------------
const byArea = new Map()
for (const d of docs) {
  const k = d.area || 'unassigned'
  if (!byArea.has(k)) byArea.set(k, [])
  byArea.get(k).push(d)
}
const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)
const perShard = args.perShard ?? 8
const wanted = Math.max(1, Math.ceil(docs.length / perShard))
// Each shard costs an auditor plus its findings' verifiers; RESERVE * 3 is the working estimate.
const affordable = budget.total ? Math.max(1, Math.floor(budget.remaining() / (RESERVE * 3))) : Infinity
const shardCount = Math.max(1, Math.min(args.maxShards ?? 6, wanted, areas.length, affordable))
const shards = Array.from({ length: shardCount }, () => [])
for (const [, group] of areas) {                    // greedy: next area joins the smallest shard
  shards.sort((a, b) => a.length - b.length)
  shards[0].push(...group)
}
const active = shards.filter(s => s.length)
if (shardCount < wanted) say(`sharding: ${active.length} auditors for ${docs.length} docs (wanted ${wanted}) — bounded by ${affordable < wanted ? 'budget' : 'maxShards'}`)

// ---------------------------------------------------------------------------
// Phases 3+4 — Audit, then Verify, as a PIPELINE: a shard's findings go to their verifiers the
// moment that shard returns, instead of every shard waiting for the slowest one.
// ---------------------------------------------------------------------------
phase('Audit')
const refuted = []
const perShardResults = await pipeline(
  active,
  (shard, _orig, i) => (async () => {
    const release = claim_(1)
    if (!release) { uncovered.push(`shard ${i + 1} (${shard.length} docs): auditor never ran (under reserve)`); return null }
    try {
      const r = await agent(
        `You are auditing DOCUMENTATION against the code that is supposed to implement it. The code
         and its tests are the source of truth for BEHAVIOUR; the authoritative externals below are
         the source of truth for INTENT. Where a document disagrees with either, the document is
         what is wrong — unless the code is wrong, which is itself a finding.

         YOUR DOCUMENTS (audit only these; other agents hold the rest):
         ${shard.map(d => `- ${d.path} [${d.type}] describes: ${d.area}${d.describes ? ` — ${d.describes}` : ''}`).join('\n')}

         ${externalDigest.length ? `AUTHORITATIVE EXTERNAL CONTEXT (read-only; a repo doc contradicting this is wrong):\n${externalDigest.map(e => `## ${e.name}\n${e.digest}`).join('\n\n')}` : 'No external sources were supplied.'}

         Read each document IN FULL, then read the code it describes IN FULL — do not judge a claim
         from a filename or a grep hit. For every load-bearing claim, go and check it.

         Report these kinds, and keep them distinct because their remedies differ:
         - drift: the document asserts something the code/tests/externals contradict. The remedy is
           to correct the document — or, if the CODE is what is wrong, sourceOfTruth 'doc' is not
           available to you: report action 'file-ticket' and say the code must change.
         - bloat: the document is CORRECT but restates what the code already says — a paragraph
           narrating a function body, a comment repeating the line under it, a README section
           listing the modules that exist. It is drift that has not happened yet, because nothing
           updates it when the code moves. Delete it, or replace it with the thing code cannot say.
           NOT bloat: intent, rationale ("why", not "what"), a contract with an outside caller, an
           interface reference that outside consumers actually read, onboarding narrative,
           non-obvious constraints, or an ADR recording a decision. When in doubt it is not bloat —
           say who reads it, and if you cannot say, that is your answer.
         - contradiction: two documents assert incompatible things. Name both.
         - gap: the code has behaviour, a failure mode or a constraint that a reader NEEDS and no
           document records — but only where the absence actually costs someone. An undocumented
           private helper is not a gap.
         - orphan: a document describing code that no longer exists, or a decision long superseded.

         Rules that decide the disposition:
         - An ADR is a dated record of a decision. NEVER edit one into agreement with the present:
           supersede it (action 'supersede-adr') so the history survives.
         - Anything that will take longer than a focused edit is effort 'L' and action 'file-ticket'.
         - Where you cannot establish which side is right, action 'ask-human'. That is a real answer
           here, not a failure — a guessed source of truth is how a correct document gets deleted.
         - Report at most ${args.maxFindingsPerShard ?? 25} findings, worst first, and say in
           'evidence' where you checked. A finding without a code anchor or a quoted external claim
           will be refuted, and should be.

         ${args.libraryIndex ? `Read the Library index at ${args.libraryIndex} and fold in what it records about this repo's conventions.` : ''}
         Keep a chronicle at ${args.chronicleDir ?? '.housekeeping/chronicles'}/audit-shard-${i + 1}.md as you go.
         ${READ_ONLY} ${NO_SPAWN}
         Return {findings: [...]}; empty is a fine answer for documentation that holds up.`,
        { label: `audit:shard-${i + 1}`, phase: 'Audit',
          model: args.tiers?.audit ?? 'sonnet', schema: FINDINGS })
      if (!r) { uncovered.push(`shard ${i + 1} (${shard.map(d => d.path).join(', ')}): auditor died — those docs are unexamined`); return null }
      return r.findings ?? []
    } finally { release() }
  })(),
  // Verify — inside the pipeline, so shard 1's findings are being refuted while shard 3 still reads.
  (found, _orig, i) => parallel((found ?? []).map(f => () => (async () => {
    const release = claim_(1)
    if (!release) { uncovered.push(`verify "${f.claim.slice(0, 60)}" (${f.doc}): never ran (under reserve)`); return null }
    try {
      const v = await agent(
        `Refute this documentation finding. You are trying to KILL it.
         Finding: ${JSON.stringify(f)}
         ${externalDigest.length ? `Authoritative external context:\n${externalDigest.map(e => `## ${e.name}\n${e.digest}`).join('\n\n')}` : ''}
         Read the document AND the code yourself — do not trust the summary you were handed.
         Attack it on every axis that applies:
         - Is the claim actually in the document, and does it actually say what the finding says?
         - Is the "reality" actually what the code does — at that path, on that path's real inputs,
           not on a nearby function with a similar name?
         - For 'bloat': WHO reads this document? If any real audience (an outside consumer, a new
           joiner, an operator at 3am, an auditor) needs it and could not get it from the code in
           reasonable time, the finding is refuted. Bloat is the finding most likely to be wrong and
           the most expensive to be wrong about — deletion is not reversible for a reader who never
           knew the paragraph existed.
         - For 'gap': does the absence actually cost anyone, or is this a request to document the
           obvious? A gap nobody would look for is not a gap.
         - Is the named sourceOfTruth right for THIS KIND OF CLAIM? Behaviour → code and tests.
           Intent, requirements, deadlines → the authoritative external. A recorded decision → the
           ADR. If the finding named the wrong one, return the right one.
         Default to refuted:true when the evidence does not hold up. If it survives, set
         refuted:false and 'proof': the exact lines (path:line) or the quoted external claim.
         You may correct 'sourceOfTruth' and 'action'; leave them null to keep the finding's own.
         ${READ_ONLY} ${NO_SPAWN}`,
        { label: `verify:${norm(f.doc).split('/').pop().slice(0, 20)}-${f.kind}`, phase: 'Verify',
          model: args.tiers?.verify ?? 'sonnet', schema: VERDICT })
      if (!v) { uncovered.push(`verify "${f.claim.slice(0, 60)}" (${f.doc}): verifier died — finding unjudged`); return null }
      if (v.refuted) { refuted.push(`${f.doc} [${f.kind}] ${f.claim.slice(0, 80)} — ${v.why}`); return null }
      return { ...f,
               sourceOfTruth: v.sourceOfTruth ?? f.sourceOfTruth,
               action: v.action ?? f.action,
               proof: v.proof ?? f.evidence,
               shard: i + 1 }
    } finally { release() }
  })()))
)

// Dedup across shards — AFTER verification, deliberately. Areas do not overlap, so a cross-shard
// duplicate is rare (a repo-wide README described by two areas is the usual case), and deduping
// first would need a barrier across every auditor, stalling fast shards behind the slowest one.
// The trade is a rare duplicated verifier against never stalling; if duplicates stop being rare in
// some repo, that is the signal to move this above the verify stage and pay the barrier.
const seen = new Set()
const survivors = []
for (const f of perShardResults.filter(Boolean).flat().filter(Boolean)) {
  const k = key(f)
  if (seen.has(k)) continue
  seen.add(k)
  survivors.push(f)
}

// ---------------------------------------------------------------------------
// Phase 5 — Consolidate. THIS ONE NEEDS THE BARRIER, and it is the only one that does: a
// cross-document contradiction is invisible to every agent that saw one shard, and the ordering of
// dispositions ("delete the README section" vs "fix the README section") can only be decided
// against the whole set. Everything upstream of here was a pipeline for exactly that reason.
// ---------------------------------------------------------------------------
phase('Consolidate')
let consolidated = null
if (survivors.length) {
  const release = claim_(1)
  if (!release) {
    uncovered.push('consolidation never ran (under reserve) — findings are unordered and cross-document contradictions were not sought')
  } else {
    try {
      consolidated = await agent(
        `Here is every VERIFIED documentation finding from this repository, from auditors who each
         saw only part of the documentation:
         ${JSON.stringify(survivors, null, 1)}

         Do the three things no single auditor could:
         1. CONTRADICTIONS ACROSS SHARDS: name any pair of documents asserting incompatible things
            that no single finding captures, and say which one the source of truth backs.
         2. CONFLICTING DISPOSITIONS: where two findings would act on the same document in
            incompatible ways (fix a section one wants deleted, edit an ADR another supersedes),
            say which wins and why.
         3. THE PATTERN: what does this set say about HOW this repo's documentation drifts — a doc
            type that is always stale, a convention that keeps being restated in three places, an
            area with no owner. This is the part that stops the same cleanup recurring next quarter.
         Do not re-judge findings; they have been verified. Do not invent new ones.
         Return terse markdown, under 60 lines. ${READ_ONLY} ${NO_SPAWN}`,
        { label: 'consolidate', phase: 'Consolidate', model: args.tiers?.consolidate ?? 'sonnet' })
      if (!consolidated) uncovered.push('consolidation agent died — cross-document contradictions were not sought')
    } finally { release() }
  }
}

const RANK = { contradiction: 0, drift: 1, orphan: 2, gap: 3, bloat: 4 }
const findings = survivors
  .sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9))
  .map((f, i) => ({ id: `D${i + 1}`, ...f }))     // stable ids: the conductor adjudicates BY id

say(`audit: ${findings.length} verified, ${refuted.length} refuted, ${uncovered.length} uncovered`)

return {
  findings,                                        // adjudication-ready; NOTHING has been changed
  refuted,                                         // killed by a verifier — kept so the run is auditable
  consolidated,                                    // cross-document view + the drift pattern
  inventory: docs,
  externals: externalDigest.map(e => e.name),
  uncovered,
  // The gate the conductor reads before it says "the documentation is in order". A dead auditor or
  // an unread external means part of the surface was never looked at, and silence there is not a
  // clean bill of health.
  complete: uncovered.length === 0,
}
