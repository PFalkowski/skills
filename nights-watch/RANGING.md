# The Ranging — one ticket, done properly

> *A ranging is one mission beyond the Wall.* No muster, no standing loop, no worker pool — the user hands the Watch a single ticket and it comes back with a PR or a precise reason it couldn't.

The Ranging is the Watch's answer to "do this one thing, and do it right." Everything about the patrol that exists to serve *throughput* — scanning the tracker, the readiness label, tiering for economy, one-at-a-time pacing, the loop — falls away. Everything that exists to serve *correctness* — the fact-check gate, the by-the-book lifecycle, the adversarial grill, the chronicle and the fire — stays, and hardens.

```
/nights-watch ticket=42                              # a tracker issue
/nights-watch ticket=https://github.com/o/r/issues/42
/nights-watch ticket="CSV export drops the last row when the file has no trailing newline"
```

## What changes from a patrol

| | Patrol | Ranging |
|---|---|---|
| Ticket source | tracker query for the `ai-ready` label | the user, directly — an id, a URL, or prose |
| Oath rule 3 (only sworn tickets) | the label is the human's vouch | **the user handing it over IS the vouch** — no label required |
| Gate failure | comment + `ai-blocked`, move on | **ask the user** — they're right there; there is no next ticket to move on to |
| Process | assigned by tier rubric | **always the full lifecycle** (see below) — no exceptions for small-looking work |
| Model tier | haiku / sonnet / opus by rubric | rubric still picks, but with a **floor of `sonnet`** — haiku doesn't run a lifecycle |
| Concurrency | worker pool, `parallel` / `max-workers` | one ranger. No pool, no Workflow needed |
| Loop | standing watch, self-paced | none — the ranging ends when the PR is open or the blocker is reported |
| The fire | closes every patrol | closes the ranging too, just briefly |

Everything not in this table is unchanged: the Oath, the fact-check discipline at every critical decision moment, the Library recall-before-work, the chronicle-as-you-go, `code-review-grill` before any PR is called done.

## The ranging, step by step

**1. Accept the ticket.** Resolve what the user handed over into a brief. A tracker ref → fetch title, body, comments (`gh issue view <id> --comments`, or the Jira MCP/CLI). Prose → the prose *is* the ticket; offer to file it on the tracker so the PR has something to reference, but don't insist.

**2. Gate it — with the user in the room.** Run the readiness gate ([TRIAGE.md](TRIAGE.md) § Readiness gate) exactly as written, including rule 6: every load-bearing claim in the ticket goes through **fact-check** before a single line is planned. The difference is what a failure means. A patrol blocks and moves on; a ranging turns to the user and asks — the missing acceptance criterion, the human fork in the road, the epic that needs splitting. Ask once, ask precisely, ask everything at once. A refuted premise still stops the work: report the evidence, don't negotiate around it.

**3. Claim it.** Tracker ticket → `ai-working` + a comment. Prose ticket → nothing to label; say what you're about to do and get on with it.

**4. Dispatch one ranger.** A single `agent()` call — the watcher still takes no part in the work (Oath rule 2). Its brief is the ranging brief below. No worktree isolation is needed with one ranger; let it use the working tree.

**5. Grill it.** A **fresh** reviewer that never saw the ranger's rationale runs `code-review-grill` on the diff. For a load-bearing change (public API, schema, security, concurrency) take the quorum, not the single reviewer. Confirmed findings get fixed and re-grilled; the review posts to the PR.

**6. Report.** PR opened, link commented, `ai-done` — or the blocker, in full, to the user. Same terminal states as a patrol (Oath rule 7); one of them is now a sentence to a human instead of a label.

**7. Gather at the fire.** Read the ranger's chronicle, curate what's durable into the Library ([LIBRARY.md](LIBRARY.md)), append one journal line. One ticket earns a small fire — but a lesson learned on a ranging is worth exactly as much to the next agent as one learned on patrol, and the chronicle is discarded either way.

## The ranger's brief — the full lifecycle, every time

The ranger runs **sdlc-old-fashioned** end to end, whatever the ticket's size. This is the point of the mode: the user asked for one thing done properly, so the discipline is not means-tested. The tier rubric governs which *model* carries it, never whether the process happens.

Spec → grilled requirements → design + adversarial design review → **TDD (Red → Green → Refactor)** → implement → adversarial review → **documentation** → merge-ready PR → retrospective notes to the chronicle.

Three parts of that chain are the ones agents quietly skip on small tickets, so they are completion conditions, not aspirations:

- **Planning is written down.** The spec and the design decisions land somewhere reviewable — the PR body at minimum, an ADR when the decision is architectural and hard to reverse. A design a reviewer can't read wasn't reviewed.
- **The test fails first.** Red before Green, and the Red must fail *for the reason the ticket describes*. A test that passes the moment it's written proved nothing; the nightshift 3-attempt limit applies (past three, return blocked — human judgment beats more tries).
- **Documentation the change invalidates is updated in the same PR.** README, `CONTEXT.md`, ADRs, CHANGELOG, doc comments, the skill's own docs — whatever the change makes untrue. Docs that lie are worse than absent docs, and "docs later" is how they start lying. If nothing was invalidated, say so in the PR; that's a finding, not an omission.

And the standing discipline, unchanged from the patrol: read the Library index first and open only what's relevant; chronicle field notes the moment they're learned, not at the end; run **fact-check** at every critical decision moment — a root-cause call, a design fork, any unverified fact about to enter code — decomposing the decision into verifiable sub-claims and proving each with a runnable experiment plus its output, or independent authoritative sources. Unprovable counts as false. A premise that dies under fact-check ends the ranging honestly: return blocked with the evidence.

## When NOT to range

A ranging is expensive on purpose. It is the wrong tool for a typo sweep or a dep bump — label those `ai-ready` and let a patrol give them to a haiku ranger, or just fix them. It is also not the tool for shipping fast: that's `go-go-go`. Reach for the ranging when one ticket matters enough that a wrong answer costs more than the lifecycle does.
