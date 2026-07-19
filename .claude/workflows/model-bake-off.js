export const meta = {
  name: 'model-bake-off',
  description: 'Rubric-first, blind-scored, dollar-ranked bake-off across candidate models for one task class',
  whenToUse: 'Choosing which model tier to standardise on for a recurring class of task. Dispatched by the model-bake-off skill, which gathers the verbatim prompt and candidate list first.',
  phases: [
    { title: 'Rubric & pricing', detail: 'write the rubric and pull live per-token rates — before any output exists' },
    { title: 'Run candidates', detail: 'the same verbatim prompt at each model, matched effort' },
    { title: 'Verify claims', detail: 'extract each output load-bearing claims and try to refute them' },
    { title: 'Blind score', detail: 'judges see an anonymised output and the rubric, never the model id' },
    { title: 'Verdict', detail: 'synthesize the per-task-class recommendation' },
  ],
}

// ---------------------------------------------------------------------------
// Input contract. The skill gathers these from the user and passes them as args.
// ---------------------------------------------------------------------------
// Some hosts deliver `args` as an unparsed JSON string rather than the object the contract
// promises; this is a no-op when args already arrives parsed.
if (typeof args === 'string') args = JSON.parse(args)
const cfg = args || {}
const problems = []
if (typeof cfg.prompt !== 'string' || !cfg.prompt.trim()) {
  problems.push('args.prompt — the EXACT prompt, verbatim. A paraphrase destroys reproducibility.')
}
if (typeof cfg.taskClass !== 'string' || !cfg.taskClass.trim()) {
  problems.push('args.taskClass — the class of work (planning/triage, mechanical breadth, hard reasoning, long-horizon agentic, creative). Not the one instance.')
}
if (!Array.isArray(cfg.candidates) || cfg.candidates.length < 2) {
  problems.push('args.candidates — at least 2 entries of {tier, modelId}, spanning tiers.')
} else {
  cfg.candidates.forEach((c, i) => {
    if (!c || !c.tier || !c.modelId) problems.push(`args.candidates[${i}] needs both {tier, modelId}`)
  })
}
if (problems.length) {
  throw new Error('model-bake-off cannot run — missing inputs:\n- ' + problems.join('\n- '))
}

const effort = cfg.effort || 'medium'
const harness = cfg.harness || 'Default workflow subagent: full tool access, no custom system prompt, effort as stated.'
const ALIASES = 'ABCDEFGH'.split('')

if (cfg.candidates.length > ALIASES.length) {
  log(`Capping at ${ALIASES.length} candidates — dropping: ${cfg.candidates.slice(ALIASES.length).map(c => c.modelId).join(', ')}`)
}
const candidates = cfg.candidates.slice(0, ALIASES.length).map((c, i) => ({ ...c, alias: ALIASES[i] }))

// ---------------------------------------------------------------------------
// Schemas. Forced at the tool-call layer, so a judge cannot skip the accuracy
// criterion or hand back prose where a number is required.
// ---------------------------------------------------------------------------
const RUBRIC_SCHEMA = {
  type: 'object',
  required: ['criteria', 'loadBearingMoves'],
  properties: {
    criteria: {
      type: 'array', minItems: 3,
      items: {
        type: 'object',
        required: ['name', 'weight', 'whatEarnsTop', 'whatEarnsBottom'],
        properties: {
          name: { type: 'string' },
          weight: { type: 'number', description: 'relative weight; the set need not sum to 1' },
          whatEarnsTop: { type: 'string' },
          whatEarnsBottom: { type: 'string' },
        },
      },
    },
    loadBearingMoves: {
      type: 'array', minItems: 1,
      description: 'The specific moves that separate a strong answer from a generic one for THIS task class.',
      items: { type: 'string' },
    },
  },
}

const PRICING_SCHEMA = {
  type: 'object',
  required: ['rates'],
  properties: {
    rates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['modelId', 'inputPer1M', 'outputPer1M', 'source'],
        properties: {
          modelId: { type: 'string' },
          inputPer1M: { type: 'number', description: 'USD per 1M input tokens' },
          outputPer1M: { type: 'number', description: 'USD per 1M output tokens' },
          source: { type: 'string', description: 'Where the rate came from. Never memory.' },
        },
      },
    },
  },
}

const CLAIMS_SCHEMA = {
  type: 'object',
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      description: 'Only claims the answer LEANS ON. If it collapses when the claim is false, it belongs here. Empty array is a valid answer.',
      items: {
        type: 'object',
        required: ['claim', 'whyLoadBearing'],
        properties: { claim: { type: 'string' }, whyLoadBearing: { type: 'string' } },
      },
    },
  },
}

const CLAIM_VERDICT_SCHEMA = {
  type: 'object',
  required: ['status', 'evidence'],
  properties: {
    status: { type: 'string', enum: ['refuted', 'confirmed', 'unverifiable'] },
    evidence: { type: 'string', description: 'A runnable snippet plus its actual output, a path:line, or an authoritative deep link. Assertion is not evidence.' },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['criterionScores', 'failureMode', 'notes'],
  properties: {
    criterionScores: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'score', 'justification'],
        properties: {
          name: { type: 'string' },
          score: { type: 'number', description: '0-10' },
          justification: { type: 'string' },
        },
      },
    },
    failureMode: {
      type: 'string',
      enum: ['none', 'asked-for-clarification', 'framed-only', 'confident-error', 'refused', 'incomplete'],
      description: 'How it fell short, if it did. A cheap model that ASKS beats a pricier one that ASSERTS something false.',
    },
    notes: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['recommendation', 'headline'],
  properties: {
    headline: { type: 'string', description: 'One line: which model to standardise on for this task class, and why.' },
    recommendation: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        required: ['modelId', 'verdict', 'rationale'],
        properties: {
          modelId: { type: 'string' },
          verdict: { type: 'string', enum: ['best-value', 'budget', 'framing-pre-pass', 'over-provisioned', 'below-capability-floor'] },
          rationale: { type: 'string' },
        },
      },
    },
    capabilityFloor: { type: 'string', description: 'Did any candidate fall below the floor for this class — unable to produce the deliverable at all?' },
    investigationBudget: { type: 'string', description: 'Where extra reading/searching paid for itself in dollars, and where it did not.' },
  },
}

// ---------------------------------------------------------------------------
// PHASE 1 — rubric and pricing, both BEFORE any output exists.
// A barrier is correct here: a rubric written after outputs are read is
// anchored and worthless, and the whole ranking depends on live rates.
// ---------------------------------------------------------------------------
phase('Rubric & pricing')
log(`Task class: ${cfg.taskClass} — ${candidates.length} candidates at effort=${effort}`)

const [rubric, pricing] = await parallel([
  () => agent(
    `Write a scoring rubric for this class of task: ${cfg.taskClass}\n\n` +
    `The prompt every candidate model will be given, verbatim:\n<prompt>\n${cfg.prompt}\n</prompt>\n\n` +
    `You have NOT seen any output and must not speculate about what the models will say — a rubric shaped around ` +
    `imagined answers is anchored. Tune the criteria to what THIS class of work actually rewards.\n\n` +
    `Two criteria are mandatory:\n` +
    `- "Accuracy / did-it-verify" — fluency is not correctness. A confident, well-written WRONG answer must score below a hedged correct one.\n` +
    `- "Graceful degradation" — how the answer behaves at the edge of its ability. Asking beats asserting something false.\n` +
    `(Cost-efficiency is NOT a rubric criterion — it is computed from dollars after scoring. Do not include it.)\n\n` +
    `Also name the load-bearing moves: the specific things a strong answer to THIS prompt does that a generic one does not ` +
    `(e.g. catching that the request is already satisfied, pushing back on a shaky premise, refusing to fabricate a result it lacks data for).`,
    { label: 'rubric', phase: 'Rubric & pricing', schema: RUBRIC_SCHEMA }
  ),
  () => agent(
    `Invoke the \`claude-api\` skill and return the CURRENT per-token pricing for exactly these model ids:\n` +
    candidates.map(c => `- ${c.modelId}`).join('\n') +
    `\n\nNEVER price from memory — rates and models change, and a stale number silently corrupts the entire verdict. ` +
    `Read the rates from the skill's reference (or official pricing) and cite where each came from. ` +
    `Report USD per 1M input tokens and per 1M output tokens.`,
    { label: 'pricing', phase: 'Rubric & pricing', schema: PRICING_SCHEMA }
  ),
])

if (!rubric || !pricing) throw new Error('model-bake-off: rubric or pricing agent failed — cannot score or rank without both.')

const rateFor = (modelId) => (pricing.rates || []).find(r => r.modelId === modelId)
const unpriced = candidates.filter(c => !rateFor(c.modelId))
if (unpriced.length) {
  throw new Error(`model-bake-off: no live rate for ${unpriced.map(c => c.modelId).join(', ')} — refusing to rank on guessed prices.`)
}

const rubricText = rubric.criteria
  .map(c => `- ${c.name} (weight ${c.weight})\n    top: ${c.whatEarnsTop}\n    bottom: ${c.whatEarnsBottom}`)
  .join('\n')

// ---------------------------------------------------------------------------
// PHASE 2 — run the identical prompt at each candidate, matched effort.
// Sequential on purpose: budget.spent() is a shared counter, so the delta
// around an awaited call only attributes to that call when nothing else in
// this workflow is in flight. Concurrency here would corrupt the usage number.
// ---------------------------------------------------------------------------
phase('Run candidates')
const runs = []
for (const c of candidates) {
  const before = budget.spent()
  const output = await agent(cfg.prompt, {
    label: `run:${c.modelId}`,
    phase: 'Run candidates',
    model: c.tier,
    effort,
  })
  const measuredOutput = Math.max(0, budget.spent() - before)
  if (output === null) {
    log(`${c.modelId} produced no output (skipped or terminal error) — dropped from the bake-off.`)
    continue
  }
  runs.push({
    ...c,
    output,
    usage: c.usage && typeof c.usage.outputTokens === 'number'
      ? { ...c.usage, basis: 'supplied' }
      : { outputTokens: measuredOutput, basis: 'measured-output-only' },
  })
  log(`${c.alias} = ${c.modelId} — ${runs[runs.length - 1].usage.outputTokens} output tokens`)
}

if (runs.length < 2) throw new Error('model-bake-off: fewer than 2 candidates produced output — nothing to compare.')

// ---------------------------------------------------------------------------
// PHASES 3+4 — pipeline, so each candidate is judged the moment its claims are
// verified rather than waiting on the slowest sibling. No cross-candidate
// context is needed, so a barrier would only burn wall-clock.
//
// The blinding is structural: the judge agent is handed an alias and never the
// model id. The script holds the mapping and does not reveal it until ranking.
// ---------------------------------------------------------------------------
phase('Verify claims')
const assessed = await pipeline(
  runs,
  async (run) => {
    const extracted = await agent(
      `Read this answer and extract ONLY its load-bearing claims — the facts it leans on, where the answer collapses if the claim is false. ` +
      `Ignore stylistic assertions and hedged asides.\n\n<answer>\n${run.output}\n</answer>`,
      { label: `claims:${run.alias}`, phase: 'Verify claims', schema: CLAIMS_SCHEMA, effort: 'low' }
    )
    const claims = (extracted && extracted.claims) || []
    const verdicts = await parallel(claims.map(cl => () =>
      agent(
        `Try to REFUTE this claim. Default to "refuted" if you cannot establish it.\n\n` +
        `Claim: ${cl.claim}\nWhy it is load-bearing: ${cl.whyLoadBearing}\n\n` +
        `Ground it the strongest way available: run a snippet if it is executable, cite path:line if it is about this codebase, ` +
        `or confirm against two independent authoritative sources if it is documentable. Attach the actual evidence — ` +
        `the snippet AND its real output, or the deep link. Your own confidence is not evidence.`,
        { label: `refute:${run.alias}`, phase: 'Verify claims', schema: CLAIM_VERDICT_SCHEMA }
      ).then(v => (v ? { ...cl, ...v } : null))
    ))
    return { run, verified: verdicts.filter(Boolean) }
  },
  async (prev) => {
    const { run, verified } = prev
    const refuted = verified.filter(v => v.status === 'refuted')
    const unverifiable = verified.filter(v => v.status === 'unverifiable')
    const factReport = verified.length
      ? verified.map(v => `- [${v.status}] ${v.claim}\n    evidence: ${v.evidence}`).join('\n')
      : '(this answer made no load-bearing factual claims)'

    const score = await agent(
      `Score candidate "${run.alias}" against the rubric below. You are NOT told which model produced it, and you must not ` +
      `guess or let any self-identification in the text sway you — score the artefact in front of you.\n\n` +
      `TASK CLASS: ${cfg.taskClass}\n\nTHE PROMPT IT ANSWERED:\n<prompt>\n${cfg.prompt}\n</prompt>\n\n` +
      `RUBRIC:\n${rubricText}\n\n` +
      `LOAD-BEARING MOVES a strong answer makes here:\n${rubric.loadBearingMoves.map(m => `- ${m}`).join('\n')}\n\n` +
      `THE ANSWER:\n<answer>\n${run.output}\n</answer>\n\n` +
      `INDEPENDENT FACT-CHECK of the claims this answer leans on:\n${factReport}\n\n` +
      `${refuted.length ? `${refuted.length} load-bearing claim(s) were REFUTED — a confident error is worse than an honest "I could not confirm this". Drop the accuracy score hard.\n` : ''}` +
      `${unverifiable.length ? `${unverifiable.length} claim(s) were unverifiable — weigh whether the answer acknowledged that uncertainty or asserted through it.\n` : ''}` +
      `Score every rubric criterion 0-10 and justify each. Do not score cost — that is computed separately from dollars.`,
      { label: `score:${run.alias}`, phase: 'Blind score', schema: SCORE_SCHEMA }
    )
    return { ...prev, score }
  }
)

const results = assessed.filter(a => a && a.score)
if (results.length < 2) throw new Error('model-bake-off: fewer than 2 candidates survived scoring.')
const dropped = assessed.length - results.length
if (dropped > 0) log(`${dropped} candidate(s) failed scoring and are excluded from the ranking.`)

// ---------------------------------------------------------------------------
// PHASE 5 — pricing in plain JS. This is the step the whole skill exists to get
// right, and the step a model is worst at: per-token prices differ several-fold
// across tiers, so the token ranking and the dollar ranking routinely invert.
// ---------------------------------------------------------------------------
const weightedScore = (score) => {
  const byName = new Map(score.criterionScores.map(s => [s.name.toLowerCase(), s.score]))
  let total = 0, weight = 0
  for (const crit of rubric.criteria) {
    const s = byName.get(crit.name.toLowerCase())
    if (typeof s === 'number') { total += s * crit.weight; weight += crit.weight }
  }
  return weight > 0 ? total / weight : 0
}

// When usage is supplied in full we price exactly. When we only measured output
// tokens, input is unknown — so bracket it across plausible input:output ratios
// and check whether the ranking survives every one of them.
const RATIOS = [
  { name: 'output-only floor (input≈0)', inputPerOutput: 0 },
  { name: 'light read (2:1 in:out)', inputPerOutput: 2 },
  { name: 'read-heavy agentic (5:1)', inputPerOutput: 5 },
  { name: 'very read-heavy (10:1)', inputPerOutput: 10 },
]

const costFor = (run, ratio) => {
  const rate = rateFor(run.modelId)
  const u = run.usage
  if (typeof u.inputTokens === 'number' && typeof u.outputTokens === 'number') {
    return (u.inputTokens * rate.inputPer1M + u.outputTokens * rate.outputPer1M) / 1e6
  }
  const out = u.outputTokens
  const inp = out * ratio.inputPerOutput
  return (inp * rate.inputPer1M + out * rate.outputPer1M) / 1e6
}

const exactlyPriced = results.every(r => typeof r.run.usage.inputTokens === 'number')
const splits = exactlyPriced ? [{ name: 'exact (supplied usage)', inputPerOutput: null }] : RATIOS

const rankingPerSplit = splits.map(split => ({
  split: split.name,
  order: results
    .map(r => ({ modelId: r.run.modelId, valuePerDollar: weightedScore(r.score) / Math.max(costFor(r.run, split), 1e-9) }))
    .sort((a, b) => b.valuePerDollar - a.valuePerDollar)
    .map(x => x.modelId),
}))

const firstOrder = rankingPerSplit[0].order.join(' > ')
const rankingRobust = rankingPerSplit.every(r => r.order.join(' > ') === firstOrder)
log(rankingRobust
  ? `Ranking is robust across every input/output split tried: ${firstOrder}`
  : `Ranking FLIPS with the input/output split — the verdict must say so rather than pick a winner.`)

const table = results.map(r => {
  const rate = rateFor(r.run.modelId)
  const costs = {}
  for (const split of splits) costs[split.name] = Number(costFor(r.run, split).toFixed(4))
  return {
    modelId: r.run.modelId,
    tier: r.run.tier,
    alias: r.run.alias,
    usage: r.run.usage,
    rate: { inputPer1M: rate.inputPer1M, outputPer1M: rate.outputPer1M, source: rate.source },
    weightedScore: Number(weightedScore(r.score).toFixed(2)),
    failureMode: r.score.failureMode,
    criterionScores: r.score.criterionScores,
    refutedClaims: r.verified.filter(v => v.status === 'refuted').map(v => v.claim),
    costUSD: costs,
    notes: r.score.notes,
  }
})

// A pure-token ranking, kept only so the verdict can show whether the dollar
// ranking contradicts the intuition people actually arrive with.
const tokenOrder = [...table].sort((a, b) => a.usage.outputTokens - b.usage.outputTokens).map(t => t.modelId)

// ---------------------------------------------------------------------------
// PHASE 6 — synthesize. Aliases are unblinded here and nowhere earlier.
// ---------------------------------------------------------------------------
phase('Verdict')
const verdict = await agent(
  `Deliver the verdict for this bake-off. Give a RECOMMENDATION PER TASK-CLASS, not a bare "model X wins".\n\n` +
  `TASK CLASS: ${cfg.taskClass}\n\n` +
  `SCORED, PRICED RESULTS (scores were produced blind; dollar costs are computed from live rates):\n` +
  JSON.stringify(table, null, 2) + `\n\n` +
  `Ranking by value-per-dollar under each input/output split tried:\n` +
  rankingPerSplit.map(r => `- ${r.split}: ${r.order.join(' > ')}`).join('\n') + `\n\n` +
  `Ranking robust across splits: ${rankingRobust}\n` +
  `Ranking by output tokens alone (cheapest-looking first): ${tokenOrder.join(' > ')}\n\n` +
  `Assign each model exactly one verdict:\n` +
  `- best-value: top quality at a sane cost — the default pick for this class.\n` +
  `- budget: delivers the actual deliverable for materially less; say what is traded.\n` +
  `- framing-pre-pass: produces structure and the right questions, not the final answer — use before handing to a bigger model.\n` +
  `- over-provisioned: most expensive, no quality edge HERE; reserve for tasks whose difficulty needs the headroom.\n` +
  `- below-capability-floor: could not produce the deliverable at all.\n\n` +
  `Call out explicitly if the dollar ranking contradicts the token ranking — that is the trap this whole exercise exists to catch. ` +
  `${rankingRobust ? '' : 'The ranking is NOT robust to the input/output split — say so plainly and state what usage data would settle it, instead of declaring a winner.'}`,
  { label: 'verdict', phase: 'Verdict', schema: VERDICT_SCHEMA }
)

return {
  taskClass: cfg.taskClass,
  verdict,
  results: table,
  rankingPerSplit,
  rankingRobust,
  tokenOrderForContrast: tokenOrder,
  rubric,
  pricing: pricing.rates,
  // Everything needed to re-run this bake-off against a future tier.
  reproduction: {
    promptVerbatim: cfg.prompt,
    effort,
    harness,
    candidates: candidates.map(c => ({ tier: c.tier, modelId: c.modelId })),
    usageBasis: exactlyPriced ? 'supplied input+output usage' : 'measured output tokens; input bracketed across ratios',
  },
}
