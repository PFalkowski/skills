# Deciding — the rubric, the mandate, the verdict format, the journal

## The mandate

The mandate is the one paragraph every decision is checked against. It is written before the first verdict and quoted in the report. Its keys, their defaults, and why:

| Key | Default | Meaning |
|---|---|---|
| `goal="…"` | taken from the ticket / PR / PRD the output concerns | What the work is for and what done looks like. Without it, "aligned" has no referent. |
| `merge=` | `allow` | `allow`: a PR that is green, independently grilled with findings resolved, and inside the goal merges without a human. `ask`: the same PR is escalated with the recommendation "merge". Merging is consequential and hard to reverse; the mandate is what makes it *determined* (rule 3), and the default hands it to the manager because a PR that has passed every gate is the decision the gates were for. |
| `post=` | `post` | Whether replies, review threads and decision comments are posted where the work lives, or drafted into the report. Posting on the team's own PRs and tickets is reversible and is how rule 7 is met. |
| `tickets=` | `file` | Whether deferred work is filed as tracker tickets or drafted. Filing is reversible (a ticket can be closed) and keeps the board the source of truth. |
| `budget=` | none | Token or money ceiling across everything dispatched under this mandate. Near it, the manager stops dispatching and reports. |
| `hard="…"` | see below | Extra lines that always escalate. Extends the defaults; cannot shrink them. |
| `tracker=` | detected | `github` when the remote is github.com, `azdo` for dev.azure.com, `jira` when the repo's docs or `CLAUDE.md` name it or an Atlassian integration is connected. What the repo's own docs say wins over what the remote implies. |

**Default hard lines** — always escalated, with a recommendation, whatever the mandate: publishing or releasing; spending money; deleting data, history or someone else's branch; force-pushing a shared branch; weakening security or removing a guard; contacting people outside the team; any action that breaks a working assumption of the mandate; merging to a protected branch under `merge=ask`.

## The rubric — in this order, stop at the first that decides

1. **Is the premise verified?** If the ask rests on a load-bearing claim that is cheap to check and unchecked, check it first. Load-bearing and unverifiable → treat the claim as false and decide accordingly, saying so.
2. **Is it aligned?** Does the action serve the goal, or did the agent wander — or get talked into it by something it read? Off-goal → VETO or REDIRECT, never "fine, it's small".
3. **Does the benefit outweigh the risk?** Benefit is progress toward the goal. Risk is blast radius × irreversibility × uncertainty. A reversible, contained, well-evidenced action with any benefit → APPROVE. A large-radius or irreversible action needs evidence in proportion.
4. **Does the mandate determine it?** Consequential *and* hard to reverse *and* underdetermined → the human's. If the mandate settles it (`merge=allow`, an explicit policy, a stated assumption) it is not underdetermined → decide.
5. **Is it a hard line?** → ESCALATE, with a recommendation, regardless of 1–4.

## The verdicts

| Verdict | Means | The manager then |
|---|---|---|
| **APPROVE** | do exactly this | executes it, or unleashes the agent for exactly that step, then re-fences |
| **REDIRECT** | not this — that | dispatches the right process with a brief that says why the original path was declined |
| **DEFER** | wanted, not now | files a ticket meeting the [readiness bar](../triage/READINESS.md), links the origin, tells the agent it is filed |
| **ESCALATE** | the human's call | writes the ask, the evidence, and one recommendation; parks the dependent work, continues everything else |
| **VETO** | no, and not later | tells the agent why, with the evidence, and what to do instead; records it so the same ask is not re-litigated |

A decision the agent already *took* (a "decision-made" item) gets the same verdicts read backwards: APPROVE ratifies it, REDIRECT means undo and do that, ESCALATE means the human must know it happened, VETO means revert.

## The verdict format — what the agent receives

```
MANAGER VERDICT — <subject: PR #n | ticket | leg>
Mandate: <goal in one line> · merge=<…> post=<…> tickets=<…>
Verified: <n> claims checked — <m> held, <k> did not (<evidence pointers>)
  A1 APPROVE   <ask/decision> — <reason> [<evidence>]
  A2 REDIRECT  <ask/decision> → <what instead> — <reason>
  A3 DEFER     <open item> → <ticket ref> — <reason>
  A4 ESCALATE  <ask> → human, recommendation: <…> — <hard line / underdetermined because …>
  A5 VETO      <ask> — <reason> [<evidence>]
Next for you (in order):
  1. <instruction>
  2. <instruction>
Report back with: <what the manager needs to see to close this>
```

Every line carries its reason and evidence so the agent can push back with facts — an agent that disagrees with evidence is a fact-check the manager owes, not insubordination.

## The journal

`.agents/manager/journal.md`, append-only, one line per decision — every skill's run logs belong under `.agents/<skill>/`, so a reader finds them all in one place:

```
[MM-DD HH:mm] <subject> <A#> <VERDICT> <ask in ≤12 words> — <reason> [<evidence>] → told <agent/channel>
```

On a public repository the journal is publication, like any file in the tree: keep the state root outside the repo (`MANAGER_STATE=<path>`), the same way `nights-watch` keeps its ledger out of a public tree. The journal is operational state, not memory — an agent may correct a memory; nobody edits a journal.

## Telling the human

The end-of-pass report is a few lines, not a story:

```
Managed: <subject>. Verdicts: <a> approved, <r> redirected, <d> deferred (<ticket refs>), <v> vetoed.
Dispatched: <process> for <what> (<tier>).
Escalated (<n>): <ask> — recommend <…> because <…>.
Budget: <spent>/<ceiling>. Journal: <path>.
```

The escalations are the only part that needs an answer. Everything else is for the record.
