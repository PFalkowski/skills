# DOC-TRIAGE — what is true, who says so, and what to do about it

The doctrine behind step 2. The audit proposes; this decides.

## The source of truth is per *claim*, not per *document*

The most common mistake is picking a winner between two documents. Ask instead what **kind of
claim** is in dispute, and the winner is already decided:

| The claim is about… | Source of truth | Why it, and not the other |
|---|---|---|
| **Behaviour** — what happens, in what order, on what input | **the code, and its tests** | It is the thing that actually runs. A test is the executable half of the documentation: it is the only doc a build can fail. |
| **Intent** — what was asked for, acceptance criteria, deadlines, ownership | **the authoritative external** (Jira / Azure DevOps / Confluence / PRD) | The code cannot tell you what someone *wanted*. Code that faithfully implements the wrong intent is a bug, and only the tracker can say so. |
| **A decision** — why this way, what was rejected, what it cost | **the ADR** | Nothing else records the road not taken. The code shows the choice; only the ADR shows that it *was* a choice. |
| **A contract with an outside party** — a public API, a wire format, an SLA | **the published contract**, then the code | Consumers you cannot see have already built against the published version. Reality here is what they were told, not what you deployed. |
| **A procedure** — deploy, rollback, incident response | **the runbook, last time it was run** | Untestable by reading. If nobody has run it since the last change, its truth is unknown — say so rather than assuming either way. |
| **Anything nobody can establish** | **a human** | `ask-human` is a real answer. A guessed source of truth is how a correct document gets deleted. |

**Externals are authoritative and read-only.** They are the source of *context* for intent — and
another team's system of record. Where one is wrong, that is a finding to report to a person, never
an edit to make.

## The three findings, and why they must not be merged

| | Drift | Bloat | Gap |
|---|---|---|---|
| **What it is** | The doc and the truth disagree | The doc is *correct* and merely restates what the code already says | Something a reader needs that nothing records |
| **The tell** | A claim you can falsify at a `path:line` | Delete it and no reader loses anything the code would not have told them in a minute | You had to read the source to answer a question a reader will have too |
| **Cost if left** | Someone acts on a false statement | It goes stale silently — it is drift that has not happened yet, and nothing updates it when the code moves | The knowledge lives in one person's head, or nowhere |
| **Remedy** | Correct it — or file a ticket if the *code* is what is wrong | Delete it, or replace it with the thing code cannot say | Write it, or file it |

Two more the audit reports: **contradiction** (two docs assert incompatible things — resolve with
the ladder above, then fix the loser) and **orphan** (a doc describing code that no longer exists —
delete, or supersede if it is an ADR).

### The bloat test

> **What does this document say that the code cannot?**

If the honest answer is "nothing", it is bloat and it will be a lie within two sprints. If the
answer names something — *why* this design, *what* an outside consumer may rely on, *which*
constraint is not obvious, *how* a newcomer should approach the thing — it stays, whatever it costs
in lines.

**Not bloat, however mechanical it looks:** an interface reference outside consumers actually read;
a "why" comment above surprising code; a documented invariant; onboarding narrative; a decision
record; a warning that saves someone an hour at 3am. Generated documentation is not bloat either —
it cannot drift — but hand-maintained documentation *duplicating a generator's output* is.

**When in doubt, it stays.** Say who reads it; if you cannot name an audience, that is your answer,
but it is still the user's call. Deletion is invisible to the reader who needed it.

## What each document type is *for*

| Type | Its job | Housekeeping rule |
|---|---|---|
| **README** | Orientation: what this is, how to run it, where to go next | The most-drifted artifact in any repo. Prune to what only it can say; link, don't restate. |
| **ADR** | A dated decision and its context | **Never edit into agreement with the present.** Supersede it, and link both ways. A rewritten ADR loses the only thing an ADR has. |
| **PRD / spec** | Intent and acceptance criteria | Judge against the tracker, not the code. A PRD the code contradicts may mean the *code* is wrong. |
| **Runbook** | Steps under pressure | Verify by running, or mark the steps as unverified since a date. An untested runbook is worse than none — it is trusted at exactly the wrong moment. |
| **Guide / tutorial** | A path through, for a specific reader | Ask who. A guide with no reader is bloat; one with a real reader survives being long. |
| **API reference** | The contract | Prefer generated. Hand-written references duplicating a generator are bloat with a citation. |
| **Code comments** | *Why*, not *what* | See below — they drift hardest because nothing reviews them. |
| **CHANGELOG** | What changed, for consumers | Append-only history. Never rewrite it to match the present. |

### Comments

- **`what` comments are bloat**: `// increment the counter` above `counter++`. The code says it,
  the comment goes stale, and reviewers stop reading comments that add nothing.
- **`why` comments are the highest-value documentation in the repo**: the workaround and the bug it
  dodges, the ordering that looks arbitrary, the constant with a source, the thing tried and
  abandoned. These are not bloat at any length.
- **A comment contradicting its code is drift with a short fuse** — it is read by whoever is already
  mid-change. Fix it first.
- **Commented-out code is neither**: it is dead weight the version control system already holds.

## Dispositions

| Action | When | Note |
|---|---|---|
| `fix-doc` | Drift where the doc is the wrong one | Correct the claim, change nothing else |
| `rewrite-doc` | Bloat with a real audience | Replace the restatement with the intent behind it |
| `delete-doc` | Bloat with no audience; an orphan | Requires an approved source of truth |
| `supersede-adr` | A decision has changed | Never in place |
| `file-ticket` | The **code** is wrong; a missing doc is real work | Step 4 — see [FILING.md](FILING.md) |
| `keep` | Verified correct, or wrong-but-cheaper-left | Say it out loud so it is not re-litigated next quarter |
| `ask-human` | The ladder cannot resolve it | Present it; do not resolve it to keep moving |

## Close the loop: what stops it drifting again?

A cleanup that does not answer this buys a quarter. For each area you touched, name the mechanism —
generate it, make a test assert it, move the claim next to the code that would break it, add a CI
check on the link, or **accept that it will drift and delete it now**. The consolidation phase of
the audit reports the *pattern* precisely so this can be answered once instead of per document.
