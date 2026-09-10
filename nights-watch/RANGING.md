# The Ranging — one ticket, done properly

```
/nights-watch ticket=42                              # a tracker issue
/nights-watch ticket=https://github.com/o/r/issues/42
/nights-watch ticket="CSV export drops the last row when the file has no trailing newline"
```

## What changes from a patrol

| | Patrol | Ranging |
|---|---|---|
| Ticket source | judged intake over the board, or a selector | the user, directly — an id, a URL, or prose |
| Oath rule 3 (ready *and* intended) | the judge or the selector answers both | **the user handing it over answers both** |
| Gate failure | record in the patrol summary, change nothing on the board, move on | **ask the user** — they're right there; there is no next ticket to move on to |
| Process | assigned by tier rubric | **always the full lifecycle** (see below) — no exceptions for small-looking work |
| Model tier | haiku / sonnet / opus by rubric | rubric still picks, but with a **floor of `sonnet`** — haiku doesn't run a lifecycle |
| Concurrency | worker pool, `parallel` / `max-workers` | one lifecycle. No pool — the watcher dispatches `sdlc-workhorse` itself, so no patrol Workflow wraps it |
| Loop | standing watch, self-paced | none — the ranging ends when the PR is open or the blocker is reported |
| The fire | closes every patrol | closes the ranging too, just briefly |

Everything not in this table is unchanged: the Oath, the fact-check discipline at every critical decision moment, the Library recall-before-work, the chronicle-as-you-go, `code-review-grill` before any PR is called done.

## The ranging, step by step

**1. Accept the ticket.** Resolve what the user handed over into a brief. A tracker ref → fetch title, body, comments (`gh issue view <id> --comments`, or the Jira MCP/CLI). Prose → the prose *is* the ticket; offer to file it on the tracker so the PR has something to reference, but don't insist.

**2. Gate it — with the user in the room.** Run the readiness gate ([TRIAGE.md](TRIAGE.md) § Readiness gate) exactly as written, including rule 6: every load-bearing claim in the ticket goes through **fact-check** before a single line is planned. The difference is what a failure means. A patrol blocks and moves on; a ranging turns to the user and asks — the missing acceptance criterion, the human fork in the road, the epic that needs splitting. Ask once, ask precisely, ask everything at once. A refuted premise still stops the work: report the evidence, don't negotiate around it.

**3. Claim it.** Tracker ticket → `ai-working` + a comment. Prose ticket → nothing to label; say what you're about to do and get on with it.

**4. Dispatch the lifecycle.** One `Workflow` call to [`sdlc-workhorse`](../archive/sdlc-workhorse/SKILL.md) — the watcher still takes no part in the work (Oath rule 2). On a ranging the watcher *is* the session agent, so it holds the `Workflow` tool and dispatches the workhorse directly; there is no pool and no nesting to worry about. Pass the gated brief as `goal`, keep `parallel: 1`, and point `libraryIndex` at the Library so the run recalls from it and curates back into it. Fold the stealth directive (Oath rule 8) into that same `goal` string — the workhorse's agents never read this skill's Oath, so it only travels if the text carries it: no code comments beyond the repo's own house rules, and nothing in commit messages, PR title, or PR description that names the Watch, nights-watch, or "ranger".

```
Workflow({ name: 'sdlc-workhorse', args: { goal: '<the gated brief>', parallel: 1,
  startedAt: '<Get-Date -Format "MM-dd HH:mm">',   // stamps the run's CLI output; WATCH.md § Stamped output
           libraryIndex: '.nights-watch/library/INDEX.md' } })
```

Running from a repo that isn't this one? Named resolution reads the *current* repo's `.claude/workflows/`, so pass `scriptPath` at this repo's copy instead of `name`.

**5. Grill it.** The workhorse already grills every slice with a fresh agent and refute-tests each finding, so the gate is met by construction — read `slices[].verifiedFindings` rather than paying for it twice. Run `code-review-grill` yourself ('yourself' works on a ranging because the watcher is the session agent and holds `Agent`) only if the report shows no review ran, or if the change is load-bearing enough (public API, schema, security, concurrency) to deserve the quorum on top. Confirmed findings get fixed and re-grilled; the review posts to the PR.

**6. Report.** The workhorse hands back a **merge-ready report** — it commits, but never pushes, opens, or merges anything, and the ranging must not smuggle that back in. So this step is the watcher's: when `mergeReady` is true, push the branch and open the PR referencing the ticket, comment the link, `ai-done`. When it's false, `mergeBlockedBy` (or `stoppedAt`, when the design never cleared its gate and no code was written) *is* the blocker report — give it to the user in full, unsoftened. Same terminal states as a patrol (Oath rule 7); one of them is now a sentence to a human instead of a label.

**7. Gather at the fire.** The workhorse runs its own retrospective and, given `libraryIndex`, curates into the Library itself — so read its `retro` and the chronicles rather than redoing the work; add what it filed but couldn't act on, and append one journal line ([LIBRARY.md](LIBRARY.md)).

## The lifecycle — every time, whatever the size

The ranging runs **sdlc-workhorse** end to end, whatever the ticket's size. The tier rubric governs which *model* carries each phase, never whether the phase happens.

Spec → grilled requirements → design + adversarial design review → **TDD (Red → Green → Refactor)** → implement → adversarial review → **documentation** → merge-ready report → retrospective notes to the chronicle.

**Why the workhorse and not `sdlc-old-fashioned`.** Old-fashioned holds its gates with a human standing at each one — and on a ranging the human has already left the room. Step 2 is where they're in it: the gate, the questions, the fork in the road. After that the work is unattended, and gates that assume a conductor who isn't there get improvised past.

Three parts of that chain are the ones agents quietly skip on small tickets:

- **Planning is written down.** The spec and the plan are separate phases whose output is text a *different* agent grills.
- **The test fails first.** The RED agent must return the test's actual output, and a second agent re-reads it and rules on one question: did it fail on the asserted behaviour, or on a typo? A false red is rejected and the slice doesn't proceed.
- **Documentation the change invalidates is updated in the same PR.** README, `CONTEXT.md`, ADRs, CHANGELOG, doc comments, the skill's own docs — whatever the change makes untrue.

And the standing discipline, unchanged from the patrol: read the Library index first and open only what's relevant; chronicle field notes the moment they're learned, not at the end; run **fact-check** at every critical decision moment — a root-cause call, a design fork, any unverified fact about to enter code — decomposing the decision into verifiable sub-claims and proving each: an executable claim is grounded only by running it and showing the real output, never by an in-repo citation or a source link in its place; otherwise, a runnable experiment plus its output, or independent authoritative sources. Unprovable counts as false. A premise that dies under fact-check ends the ranging honestly: `stoppedAt` with the evidence, no code written.

## When NOT to range

A ranging is expensive on purpose. It is the wrong tool for a typo sweep or a dep bump — label those `ai-ready` and let a patrol give them to a haiku ranger, or just fix them. It is also not the tool for shipping fast: that's `go-go-go`. Reach for the ranging when one ticket matters enough that a wrong answer costs more than the lifecycle does.
