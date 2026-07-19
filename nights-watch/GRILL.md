# The Grill — standing watch over the pull requests

> *No PR of ours ships unquestioned.* The Grill hunts open pull requests — by default our own — and puts each through an adversarial `code-review-grill`, on a cadence, unattended. It reviews; it never merges, never fixes, never approves.

The patrol works tickets; the Hunt works the delta; the Grill works the **review queue**. It wakes on a timer, musters open PRs, skips every PR already grilled at its current head sha, and dispatches one grill workflow per PR that moved. Findings that survive adversarial verification are posted back as **inline review threads at the exact problematic line** — everything that survives, nits included.

```
/nights-watch grill                          # cadenced; grills open PRs authored by us, once per head sha
/nights-watch grill prs=all                  # every open PR, not just our own
/nights-watch grill prs="label:needs-grill"  # explicit gh search query
/nights-watch grill stance=quorum concerns=security,architecture,tests   # default: single reviewer
/nights-watch grill every=30m                # cadence (default 1h)
/nights-watch grill report=document          # logbook only; nothing touches the PR
/nights-watch grill once                     # one sweep, no standing loop
```

## The wall — why this mode is shaped the way it is

This mode exists downstream of [#46](https://github.com/PFalkowski/skills/issues/46), the bug class of **silent capability loss through nesting**. An `agent()` running inside a Workflow holds no `Agent`/`Task` tool and no `Workflow` tool. It cannot spawn anything — and *nothing throws*. The agent role-plays the missing subagents and reports success: a ranger told to "grill your diff with a fresh reviewer" silently degrades to author-grades-own-work; a reviewer told "you are a quorum" plays three voices in one context and the independence that is the whole reason to pay for a quorum is silently gone. Nine rangers across three patrols each discovered the same wall independently.

So the Grill's structure is the fix, applied as architecture rather than as vigilance:

1. **Every reviewer is a first-order `agent()`, dispatched by the script.** The workflow script's own `agent()` calls are not nested spawns — that is the one place a fan-out is real. The quorum is convened *in the script*: one agent per concern, each blind to the others, findings merged and deduped in script code. Same fix as the workhorse's review stage ([WATCH.md](WATCH.md) § the wall notes).
2. **The verifiers are script-dispatched too.** Refute-verification is a second fan-out, and it lives at the same level for the same reason.
3. **The nesting budget is spent getting here.** Watcher → `grill.js` is the single `workflow()` level the Watch allows; `grill.js` calls no `workflow()` and no agent inside it is asked to.
4. **Every prompt says "do not spawn."** Because the failure is silent, the prohibition must be explicit — an agent that tries gets role-play, and role-played independence is precisely the defect this mode exists to prevent.
5. **A missing `scriptPath` returns blocked, never an improvised grill.** Same rule as the hunt and the workhorse: an un-run gate is visible, a degraded one is not.

**So: quorum is not out — it moved up.** What is out, permanently, is any *reviewer* convening anything.

## The Grill's own rules (on top of the Oath)

1. **The Grill never touches the code or the merge.** No commits, no approvals, no merge, no PR state changes. Threads and a logbook are the entire output surface. (An unattended approve is an unattended merge on auto-merge repos.)
2. **Fresh eyes only.** No reviewer ever saw the author's rationale — the grill workflow gets the PR number and the range, never the watcher's opinion, never a ranger's chronicle of building it.
3. **Only verified findings post.** Every finding — down to the last nit — faces an adversarial verifier prompted to kill it before any human reads it. What survives posts, *all* of it; severity says how much it matters, verification says whether it speaks at all. Speculation dies in the workflow (Oath rule 1: unprovable = false).
4. **One thread per finding, at the line.** A surviving finding becomes an inline review thread anchored to its `file:line` at the PR head. Never a wall-of-text review comment when a line will do; a finding that anchors to no diff line (it lives in an untouched caller) goes into one consolidated comment instead, saying where it actually lives.
5. **Never grill the same sha twice.** The grilled ledger remembers `<pr> <head-sha>`; a PR is re-grilled only when its head moves. On a re-grill, standing threads from earlier grills are passed in as dedup keys — a finding whose thread already exists is dropped before verification, so a push that fixes nothing costs re-review of the new commits, not a duplicate thread storm.

## Muster and the grilled ledger

The watcher musters with one query — `gh pr list --state open` filtered to our own PRs by default (`prs=` widens or replaces the filter) — and reads names only, per Oath rule 2: PR number, title, head/base shas, changed-file names (capped at `maxFiles`, like the hunt's muster). The diff itself is read by reviewers, inside the workflow, once per lens.

State lives beside the hunt's, same placement rules ([HUNT.md](HUNT.md) § Where the state root is — public repos keep state out of the tree):

```
<state root>/
  grills.md     # the grilled ledger: <pr#> <head-sha> <date> <posted>/<refuted> — one line per completed grill
  .lock/        # in-flight marker, mkdir-atomic, TTL rules exactly as HUNT.md § Pacing
  INDEX.md      # one line per sweep
  <date>-<n>.md # sweep reports
```

A PR enters the ledger **only when the workflow returned `complete`** — every reviewer and every verifier actually ran. A reviewer that died or was cut by the reserve leaves the PR un-ledgered, and the next tick grills it again: silence is never a clean review. Empty muster (no PRs, or none moved) → one log line, sleep; that is the common case and it must cost one `gh pr list`.

Skip list, worth stating because each is tempting: **draft PRs** are skipped by default (`drafts=true` opts in — the author said "not ready"); PRs whose head moved *during* the grill are ledgered at the sha that was grilled, so the next tick sees the newer sha and re-grills; our own grill threads never make a PR "changed".

## Dispatch — the grill workflow

One Workflow per moved PR — [`.claude/workflows/grill.js`](../.claude/workflows/grill.js), tests beside it in [`grill.test.js`](../.claude/workflows/grill.test.js). Dispatch with an absolute `scriptPath` (never `{name:}` — named resolution reads the repo being grilled, [HUNT.md](HUNT.md) § Dispatch); if the script can't be resolved, the PR is reported blocked-on-review and stays out of the ledger.

```js
// in:  { pr, title, url,
//        range: 'base..head',              // BOTH explicit SHAs — reviewers run in worktrees
//        files,                            // names only, capped by the watcher
//        stance: 'single' | 'quorum', concerns,
//        known: ['<file>:<title-key>'],    // this PR's standing threads from earlier grills
//        tiers: { review, verify, docs }, reserve, chronicleDir, libraryIndex }
// out: { findings,       // verified survivors, worst-first, each with file/line/proof/key
//        refuted, alreadyPosted, uncovered,
//        concernsRun,    // recorded from returns, never inferred from silence
//        complete }      // the ledger's gate: false whenever anything in `uncovered`
```

Inside: a cheap agent distils the repo's **house rules** once (code-review-grill's read-the-docs-first step — README, ADRs, guidelines), then reviewers fan out (single, or one per concern), then every candidate finding faces its verifier. Reviewer and verifier stages run `isolation: 'worktree'` — they diff explicit SHAs and run repro experiments, never in the user's tree. Tiers per [TRIAGE.md](TRIAGE.md) discipline: `sonnet` reviewers and verifiers, `haiku` for the docs distiller; `opus` for a single concern only when the PR is genuinely load-bearing.

The dedup key is `file:title`, no line number — line numbers shift between the shas of successive grills, and the looser key's failure mode is a duplicate thread (waste), where a line-tight key's is re-posting every standing finding after every push (noise the user learns to ignore). Same direction the hunt's fingerprint section takes every time it has the choice.

## Report — threads on the PR

The watcher posts; the workflow never writes a channel (same split as the hunt). Default `report=threads`:

- Each surviving finding → one inline review thread: `gh api repos/{o}/{r}/pulls/{pr}/comments` with `commit_id=<head sha>`, `path`, `line`, `side=RIGHT`. Body: the claim, the failure scenario (or the nit's cost), the proof, severity, and the suggestion if one survived. All of them post — the user chose verification, not severity, as the floor.
- Findings that anchor outside the diff go into **one** consolidated PR comment naming their real locations.
- The sweep report (`<date>-<n>.md` + `INDEX.md`) records per PR: posted / refuted / already-standing / uncovered — a grill that posted nothing still writes its line, because a quiet grill and a broken grill must be distinguishable.
- `report=document` keeps everything in the logbook and touches no PR; `report=chat` returns findings in-session (for `once`).

Two guards. **`prs=all` on other people's PRs is outward-facing**: unattended threads on a colleague's PR are the Watch speaking in public, so the sweep report says whose PRs were grilled, and turning that on is the user's explicit call, never a default. And **a security finding on a public repo's PR follows the disclosure gate** ([HUNT.md](HUNT.md) § Disclosure): a vulnerability does not get a public inline thread pointing at the vulnerable line — it routes to `advisory` (or `chat` fallback), and the thread says only that a finding was raised through a private channel.

## Pacing and the fire

Cadence, lock, TTL, stand-down: exactly [HUNT.md](HUNT.md) § Pacing — fixed `every` (default 1h), mkdir-atomic lock with `lockTtl` staleness, released on every exit path, skip-and-log on an in-flight tick. One sweep per wake; PRs within a sweep are grilled sequentially by default (`parallel=` raises it under the worker cap, each grill already fans out inside).

Every sweep that dispatched a workflow closes at the fire ([LIBRARY.md](LIBRARY.md)): chronicles read, lessons curated. The Grill's own calibration entry is the same one the hunt keeps: **what the verifiers killed**. A concern whose findings die 90% of the time is producing noise — fix its prompt (`evolve-skill`) or stop running it on this repo; a concern that never fires on a repo that plainly has that surface is not evidence of quality. And the ratio of `alreadyPosted` to fresh findings is the re-grill dedup working — if it ever isn't, that shows up here first.
