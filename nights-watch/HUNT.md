# The Hunt — standing watch over what just changed

> *The horn is blown for what comes out of the dark, not for what the rangers did.* The Hunt looks outward at the code as it moves, finds what is dangerous in it, proves it, and reports. It fixes nothing.

The patrol works tickets a human vouched for. The Hunt has no tickets: it wakes on a timer, looks at **what changed since it last looked**, hunts critical bugs and vulnerabilities in exactly that, verifies every candidate adversarially, and reports through a channel the user chose. Findings can become `ai-ready` tickets — which is how the Hunt hands work to the patrol and the two modes close the loop.

```
/nights-watch hunt                           # hourly, since the last hunt, report to a document
/nights-watch hunt every=15m                 # tighter cadence
/nights-watch hunt report=issues             # file each finding as an ai-ready ticket
/nights-watch hunt report=advisory           # draft GitHub security advisories (public repos)
/nights-watch hunt severity=all              # report medium/low too (default: critical+high only)
/nights-watch hunt since=7d                  # override the watermark (first hunt defaults to 7d)
/nights-watch hunt scope=commits,deps,logs logs="docker logs api --since 1h"
/nights-watch hunt for=smells,warnings       # prey: security, bugs, smells, warnings (default: security,bugs)
/nights-watch hunt target=last-commit        # ground: diff (default) | last-commit | <git range> | repo
/nights-watch hunt target=repo               # whole-repo baseline audit; big repos get a chunked backlog
/nights-watch hunt once                      # one hunt, no standing loop
```

## What changes from a patrol

| | Patrol | Hunt |
|---|---|---|
| Work source | tracker query for the `ai-ready` label | **the event streams** since the watermark (§ Events) |
| Oath rule 3 (only sworn tickets) | the label is the human's vouch | **no tickets to swear** — the Hunt reads, it never writes code, so nothing needs vouching |
| Output | a PR per ticket | **findings**, through the configured channel; never a fix |
| Oath rule 2 (the watcher takes no part) | watcher reads the tracker, never the codebase | unchanged, and it binds harder: the watcher musters **file names, never diffs** (§ Events) |
| Concurrency | worker pool, one ticket at a time | one hunt per wake; lenses fan out inside it, refuters inside them, both capped in the script |
| Loop | self-paced, 20–30 min idle ticks | **a fixed cadence the user sets** (`every`, default 1h), with an in-flight lock |
| Empty wake | empty muster → log, sleep | no new commits → **one `git log`, no workers spawned**, log, sleep |
| The fire | closes every patrol | closes every hunt that dispatched a party — including one that found nothing |

Everything not in this table is unchanged: the Oath, fact-check at every critical decision moment, Library recall before work, chronicle-as-you-go.

## The Hunt's own rules (on top of the Oath)

1. **The Hunt never fixes.** No branch, no edit, no PR of code — the deliverable is a documented finding. An unattended agent quietly rewriting security-sensitive code at 3am, with no human reading the diff, is a worse outcome than the bug it was chasing. To get it fixed, report as `issues` and let a patrol pick it up under the full gate.
2. **A finding without a failure path is not a finding.** Every reported item names the inputs or conditions and the bad outcome they produce — proven by a runnable repro with its output, or by the exact source line plus an authoritative reference (CVE/GHSA/spec). "This looks unsafe" is a hypothesis; it dies at the refuters. Unprovable = false (Oath rule 1), and here that rule is what keeps an hourly job from becoming an hourly false-alarm generator the user learns to ignore.
3. **Never blow the horn twice for the same thing.** Every candidate gets a fingerprint the script derives from a closed vocabulary (§ Fingerprints) and the ledger remembers it. A finding already reported at the same severity is dropped before the refuters — silently, cheaply, no report line. Two exceptions are worth waking someone for, and both are *comparisons*, so the ledger stores severity and status rather than mere membership: the finding's severity **rose** (`known` is a map, not a list — a match at a worse severity is refuted and reported as an escalation, since the drop-on-match filter is otherwise pointed straight at the case this rule exists for), or it **recurs after being fixed** (a `fixed` entry is a regression when it reappears, reported as one, referencing the fix that failed to hold).
4. **Disclosure is a decision, not a default.** Before writing a finding *anywhere* — the document, a ticket, or the ledger — resolve where "anywhere" is (§ Disclosure). A vulnerability in a public repo must not be published by the tool that found it.
5. **Scope is what moved.** The Hunt reads the change and what the change touches — not the whole codebase. An hourly full-repo audit is expensive, and by the third hour it is finding the same things it found in the first. (`target=repo` exists for a deliberate baseline audit — § Prey and ground; it is not a cadence.)

## Events — what "latest" means, and how it is remembered

The watermark is what makes an hourly job cheap and non-repetitive: the Hunt looks only at the delta since its last look. Its state is **not** in the Library, which holds durable facts an agent may fact-check and correct ([LIBRARY.md](LIBRARY.md) § Recall: *"entries are memory, not law"*). The watermark **is** law: there is nothing to verify it against, and a ranger "correcting" it would silently re-scan or skip a delta. Operational state and curated memory stay apart.

```
<state root>/
  state.md      # the watermark — what has already been examined
  ledger.md     # one line per finding: <fingerprint> <severity> <status> <first-seen> <where>
  carry.jsonl   # deferred candidates, whole — one JSON object per line (the ledger holds scalars,
                # and a candidate the next hunt must refute is eleven fields, not five)
  .lock/        # in-flight marker — a DIRECTORY, because mkdir is atomic
  INDEX.md      # one line per hunt
  <date>-<n>.md # the hunt reports
```

### Where the state root is, and why it is not always in the repo

| Repo | State root | Because |
|---|---|---|
| private | `.nights-watch/hunts/`, committed | it travels with the project, survives clones, and is shared by every machine that hunts — exactly what [LIBRARY.md](LIBRARY.md) promises `.nights-watch/` for |
| **public** | `~/.nights-watch/<repo-slug>/`, outside the repo | the ledger names the file and severity of live unfixed flaws, so committing it publishes what rule 4 withheld |

The public row is a **forced trade, not a free fix**, and the Hunt says so rather than discovering it at 3am. Gitignoring the state in-tree would be the obvious move and it is the wrong one: an ignored file is per-clone, so a fresh clone or a second machine has no watermark (re-audits a week) and no ledger (`known` is empty, so **every open finding is reported again** at full refuter cost — rule 3 off, exactly on the repos `report=advisory` exists for). Moving the root outside the repo keeps it off the machine's git remotes while preserving both properties *on that machine*.

What is genuinely lost on a public repo is **sharing between machines**, and no default can win it: the state must persist, be shared, and not be published, and a public repo offers no such place. So the Hunt states the choice instead of papering it: name a private path (`state=<path>` — a private sibling repo, a synced dir, **loyal-dog**'s `~/.loyal-dog`) and sharing comes back; take the default and each machine hunts its own watch, double-reporting across machines. On `issues`, `advisory` or `pr` that duplication is at least *visible* — two tickets, two drafts. On `document`, the default, it is not: two logbooks in two home directories that never meet. So a team hunting one public repo from several machines should set `state=` and not discover this later; a lone laptop is unaffected. Any repo can override `state=` — the multi-repo user pointing several repos at one root is the same knob.

`state.md` is four lines, read and rewritten whole:

```md
commits: <sha>            # HEAD of the last delta examined by every triggered lens
advisories: <ISO date>    # last dependency/advisory sweep
logs: <ISO date>          # last log cursor, if scope includes logs
hunts: <n>                # hunts run — calibration data for the fire
```

**The watermark advances when a hunt reported and every lens the delta triggered actually ran** — found something or not. A hunt that dispatched six lenses and confirmed nothing has still *examined* that delta; re-examining it next hour costs the same and reaches the same conclusion, so advancing on a clean hunt is the whole cheap-hourly property. But a hunt where `injection` was skipped for budget has **not** examined it: advancing would mean no future hunt ever looks at those commits through that lens, and the report line saying so scrolls past once. That is the silent-coverage-loss this file refuses two paragraphs down, arrived at by design instead of by crash — so a skipped lens leaves the watermark where it is and the next hunt re-covers the delta. The workflow returns `complete` for exactly this decision; the watcher does not eyeball it.

### Statuses, and the order of writes

`status` is a **closed vocabulary** — `pending` → `reported` → `fixed`, plus `deferred` — and it is closed for the same reason `flaw` and `severity` are (§ Fingerprints): it is machine-written, machine-read, and load-bearing for the guarantee below. A status invented in prose ("tracked", "open", "known") breaks the ledger silently.

| status | Means | Enters `known`? |
|---|---|---|
| `pending` | Written **before** the report was attempted; nobody knows yet whether the human ever saw it | **No** — see the reaper |
| `reported` | The channel accepted it; the human can see it | **Yes** — this is what rule 3 dedups against |
| `deferred` | Found, but not refuted this hunt (over `maxFindings`, over `maxCarry`, or under reserve). Its record is `carry.jsonl` and **not a ledger line** — the next hunt refutes it without re-hunting, so it must survive as the whole candidate, which a five-scalar ledger line cannot hold, and a status the ledger never writes is a status that rots. The ledger tracks what was *reported*; the bank tracks what is *pending judgment* | No |
| `fixed` | Confirmed gone; kept, never deleted, so a reappearance reads as a regression | No — it feeds `fixed`, which makes a match a regression |

The order of the writes is the whole at-least-once guarantee:

**ledger (pending) → report → ledger (reported) → rewrite `carry.jsonl` → watermark → release the lock.**

**Rewrite, not append** — and the word is load-bearing rather than fussy. `carry.jsonl` is the bank of candidates still awaiting refutation, so the fire replaces it wholesale with exactly the survivors: this hunt's `deferred`, minus everything that got refuted, reported, or abandoned. Append instead and both of carry's bounds invert into the bugs they were meant to prevent — `maxCarry` takes the first 24 lines in file order, which become the *oldest and deadest*, so fresh candidates starve behind corpses forever; and an `attempts: 1` line survives beside its own `attempts: 2` successor, so the two-strikes filter reads the stale one and never trips.

Banking the deferred candidates belongs *inside* the sequence, before the advance, precisely because `deferred` is the one status that does **not** hold the watermark: bank after the advance and a crash in between moves past a delta whose deferred candidates were never persisted — nobody re-hunts those commits, and the candidates are gone. Silence, by this file's own definition, through the one gap the ordering didn't cover.

The ledger is written **before** the report, not with the watermark after it. Writing both at the fire is circular: the crash window between report and fire is exactly the window in which the ledger entry was never written, so the next hunt re-computes the same fingerprint, checks a ledger that does not contain it, and reports it twice — the ledger cannot be the net for the one failure that guarantees it is empty.

**But `pending` must never enter `known`, and this is the subtlest rule in the mode.** A pending line means *"we were about to tell someone"* — not *"someone was told"*. Feed it to rule 3's dedup and a crash between the ledger write and the report buries the finding **permanently**: the next hunt re-finds it, matches `known` at the same severity, drops it silently, and every hunt after that does the same, forever. That is a real, refuted, confirmed vulnerability deleted by the mechanism meant to prevent noise — and it inverts the rule this whole ordering exists to serve.

So the ledger has a reaper, exactly as the lock has a TTL: **the watcher, when it reads the ledger at the start of every hunt, deletes any `pending` line older than `lockTtl`** — deletes, never promotes. Its finding returns to the unknown and gets re-hunted and re-reported. A crash *after* the report leaves a pending line too, so reaping costs one duplicate report; a crash *before* it costs nothing. The code cannot tell the two apart and doesn't need to: **waste is recoverable, silence is not.** A duplicate is a line read twice; silence is a vulnerability nobody hears about.

The reaper is garbage collection, not the guarantee — since `pending` never enters `known`, a stale pending line is already inert. It is written down so that nobody later "optimizes" pending into the dedup path and quietly reintroduces the burial.

Report-then-advance follows from the same rule: a crash there re-hunts a delta already reported; the reverse loses the delta forever and silently. So does banking before the advance, and so does a skipped lens holding the watermark. **One rule, applied four times.**

First hunt, or a watermark that no longer resolves (`git cat-file -e <sha>` fails — rebased, squashed, force-pushed): fall back to `since` (default `7d`) and **the watcher caps the delta at `maxFiles` (default 200) during the muster**, naming what it dropped in the report. The cap is the watcher's because the muster is — the workflow never sees the un-capped list. Never silently scan everything because a sha went missing: that is how an hourly job becomes an unbudgeted full audit, and rule 5 forbids by cadence what a lost sha would smuggle in by accident.

| Stream | In `scope` by default | Mustered by (watcher — names only) | The hunter then reads |
|---|---|---|---|
| `commits` | yes | `git log --name-only <watermark>..HEAD` | the diff and the changed files **in full, itself** — a change is dangerous in its context, not in isolation |
| `deps` | yes | which manifests/lockfiles appear in that list | the added/bumped packages, checked against advisory data (`gh api /repos/{o}/{r}/dependabot/alerts` when enabled; otherwise OSV/GHSA via **fact-check** — a version-range claim is exactly the kind of fact that must be proven, never recalled) |
| `config` | yes | which CI workflows, IaC, Dockerfiles, auth/permission config appear | the diff — this is where a one-line change quietly turns a private thing public |
| `logs` | no (opt-in) | nothing — the command in `logs=` is passed through | error/exception clusters new since the cursor; a stack trace that started an hour ago names the bug better than any static read |

**The watcher musters names, never content.** Oath rule 2 keeps the codebase out of the watcher's context, and it applies to a hunt exactly as it does to a patrol — `git log --name-only` is the tracker query's equivalent, `git diff` is not. Each hunter is handed the *range* and runs its own `git diff` inside its own context, which is also why the delta is paid for once per lens instead of being stringified into six prompts.

Empty delta → log one line, update nothing, sleep. That is the common case at night and it must cost one `git log`.

## Prey and ground — `for=` and `target=`

Two knobs shape a hunt before any lens is assigned: what kind of prey it hunts (`for=`) and what ground it covers (`target=`).

**`for=`** picks the lens families. Default `security,bugs` — the original party; the other two are opt-in because they widen the report toward things that don't wake anyone:

| Family | Lenses |
|---|---|
| `security` | `injection`, `authz`, `secrets`, `supply-chain`, `exposure` |
| `bugs` | `correctness` |
| `smells` | `smells` — bad patterns that make the *next* change dangerous |
| `warnings` | `warnings` — what the toolchain already flags and nobody reads |

The delta still decides which of a family's lenses actually run (§ The hunting party) — `for=` widens what *may* run, never forces a lens the delta can't trigger. Everything downstream is family-blind: refuters, fingerprints, the ledger, the fire. One exception: a family the user **explicitly** named bypasses the severity floor — smells and warnings rarely grade `high`, and asking for them and then filtering every one out produces a "clean" report that lies by omission. Rule 2 still binds in full: a smell without a concrete cost ("this duplication means a fix lands in one copy") is a hypothesis, and it dies at the refuters like any other.

**`target=`** picks the ground. Default `diff` — the standing watermark delta, which is the mode everything above describes:

| `target=` | Hunts | Watermark |
|---|---|---|
| `diff` | the delta since the watermark — the standing cadence | advances as § Events |
| `last-commit` | `HEAD~1..HEAD` | untouched — a spot check, not coverage |
| `<git range>` | any explicit range (`main..HEAD`, `v1.2..v2.0`) | untouched |
| `repo` | the whole codebase — a deliberate baseline audit, not a cadence (rule 5) | advances to the audit's pinned sha, **only when every chunk is done** |

`target=repo` is the one target that can outgrow a single hunt, and it must not become an unbudgeted full scan. The watcher sizes it first (`git ls-files`, against `maxFiles`). Within the cap → one hunt, one party. Over it → the watcher writes a **hunt backlog**: `<state root>/backlog.md`, the codebase divided into auditable chunks — grouped by directory, ≤ `maxFiles` files each, one line per chunk (`<chunk> <status>`, status `pending`/`done`) — plus the sha the audit is pinned to, recorded at creation. Each subsequent tick works the next `pending` chunk of the pinned tree instead of the diff, until none remain; then the backlog is retired and the mode falls back to `diff`. A chunk is a muster like any other — names only, capped, the same workflow contract; its `range` runs from git's empty tree to the pinned sha, because a full-tree delta is still a delta with two explicit ends. Commits landing mid-audit are not lost: they are simply the first `diff` delta after the watermark lands on the pinned sha.

The backlog is operational state, beside the watermark and outside the Library for the same reason (§ Events). A stand-down leaves it as-is — the `pending` lines *are* the re-cover list. And the partial-audit rule is this file's one rule applied a fifth time: unhunted chunks hold the watermark, because advancing over unexamined ground is silence, and waste is recoverable.

## The hunting party — lenses, not headcount

The party fans out over the same range, each hunter with a **different lens**. Diversity is the point: redundancy finds the same bug three times; diversity finds three bugs. Assign only the lenses the delta can plausibly trigger — no auth or SQL touched, no injection lens — and say in the report which lenses ran, so "clean" never overstates itself.

| Lens | Hunts for |
|---|---|
| `injection` | untrusted input reaching a sink: SQL/command/path/template, deserialization, SSRF |
| `authz` | missing or wrong access checks, IDOR, tenant/scope leaks, a route that lost its guard |
| `secrets` | credentials, tokens, keys entering the repo, the logs, or an error message |
| `supply-chain` | new/bumped dependency with a known advisory, a typosquat, a postinstall script, a widened version range |
| `correctness` | data loss and integrity: unhandled failure paths, races/TOCTOU, resource leaks, an invariant the diff broke |
| `exposure` | config drift that widens the blast radius: a bucket/endpoint/port opened, CORS or a CI permission widened, debug left on |
| `smells` | (family `smells`, opt-in) bad patterns with a nameable cost: duplicated logic, dead code, a god function, a leaky abstraction, tangled coupling |
| `warnings` | (family `warnings`, opt-in) compiler/linter/deprecation warnings the delta introduces — or leaves standing in the files it touched |

Tiers follow the rubric ([TRIAGE.md](TRIAGE.md)), effort follows tier: hunters at **`sonnet`** / default effort; a single lens at `opus` / `high` only when the delta is genuinely cross-cutting (a concurrency change, an auth refactor) — never the whole party.

## Verify — the refuters

Every candidate goes to **three independent refuters, each prompted to kill it**, before any human reads it. This is `code-review-grill`'s discipline applied to a hunt: the finder is the last to notice its own finding is theatre. **Two or more refutes → dropped**, silently, with a chronicle line. Severity is set by the survivors' consensus, not by the finder's enthusiasm.

Give the refuters distinct angles, or they agree for the same reason:

- **reachability** — can untrusted input actually get there? Is the path dead, guarded upstream, or unreachable in any real deployment?
- **exploitability / blast radius** — granted the flaw is real, what does it actually cost? Does a caller already constrain the input?
- **repro** — make it happen. A runnable case with real output, or the exact source lines that prove the claim. This is the one refuter that can *promote* a finding: a working repro is the strongest evidence a report can carry.

Refuters run at **`sonnet`** by default (`tiers.refute` overrides). They are many and cheap-looking, and the workhorse's refuters sit at `haiku` — but that comparison misleads: those re-run a test and read its output, while these must trace reachability through a codebase and stand up a repro. Sonnet is the floor because a refuter that can't follow the call graph refutes nothing and rubber-stamps everything, which is worse than no gate at all — it launders a guess into a "confirmed" finding.

## Fingerprints — a closed vocabulary, not a hash

Rule 3, the `known` map, the issue seam, and "this medium became a critical" all rest on one string being identical across hunters, contexts, and months. Moving the *hash* into the script is not enough, and claiming it is would be the same mistake in a new place: a hash is a pure function of its inputs, so if a model authors the inputs, a model authors the identity. Asking a hunter for "the same canonical phrase you used last month" is asking it to reproduce prose verbatim from a context it no longer has — the identical request as "compute a stable digest," restated in English and harder to audit. `unescaped input in LIKE clause` and `unescaped user input in the LIKE clause` are the same flaw and different identities.

So the key is `lens:file:symbol:subject:flaw`, and each part is chosen for how badly a model can drift on it:

- **`flaw`** is an **enum** — one of a closed vocabulary the script owns (`FLAWS` in [`hunt.js`](../.claude/workflows/hunt.js)), the same way `severity` is. A hunter picks `unescaped-input-in-query`; it cannot invent wording, because the schema rejects wording. The vocabulary is deliberately coarse: two hunters must land on the same token for one defect, which a taxonomy of twenty achieves and a taxonomy of two hundred does not.
- **`subject`** is **what the flaw is about** — the package, the credential, the port, the route, the field. It exists because a key without it collides *deterministically*, not probabilistically: two CVEs in two packages are both `supply-chain:package.json:…:vulnerable-dependency`, two leaked keys in one config are one `secret-in-source`, two opened ports in one Terraform file are one `open-network-surface`. That is the exact failure the hash was deleted to avoid — a **new, real finding silently filtered as already-known** — reintroduced by a taxonomy coarse enough to be stable. Three of the six lenses hunt files that have no functions in them, and they are the three that need `subject` most. The schema enforces **`minLength: 1`**: an optional subject is one a model may omit whenever it judges the symbol sufficient, and that judgment call is a licence to merge two different flaws into one id — a silent drop chosen by the one party with no way to know it's the second finding.
- **`symbol`** is the enclosing function/class, canonicalized by the script (last dotted segment, parens and generics stripped) — the unit that survives edits, unlike a line number. It is **empty for non-code files**: a `package.json` has no enclosing function, and requiring one just makes the hunter invent a string (`dependencies`? `lodash`? `?`) — inventing is the thing this section exists to prevent.
- **`file`** is the path, and it is the part most likely to drift now that hunters run in **worktrees whose absolute path differs every run**. `canonFile()` snaps a reported path to `args.files` — the watcher's muster, the canonical spelling by construction — when it matches. When it doesn't, the path is *kept*, not rejected: a finding in an untouched caller is in scope by design (rule 5), so gatekeeping here would discard real findings. Its stability then rests on the hunter having followed the instruction to report what `git ls-files` prints, which is exactly the prose-instruction-to-a-model this section exists to distrust — and it is unavoidable, because the script cannot run git. Say it plainly rather than imply the muster covers everything: for out-of-muster paths, the identity is only as stable as the hunter, and the cost of that is a duplicate. A path that isn't repo-relative at all is a leaked worktree absolute — it recurs *never*, so it is dropped from the key entirely rather than guaranteeing an hourly duplicate forever.

**There is no hash.** The fingerprint *is* the key, stored verbatim and compared exactly. A truncated 32-bit digest buys shorter lines in a local text file and pays with a birthday collision at a few thousand entries — and the ledger only grows, since fixed entries are kept. "No crypto in workflow scripts" is a real constraint; it never forced a lossy hash, because not hashing was always available.

Severity is deliberately **excluded**: noticing that today's medium is next month's critical requires them to share an id.

Two lenses seeing one flaw produce different fingerprints by design — `lens` is in the key, so neither swallows the other — and the script **groups on `file:symbol:subject:flaw` across lenses** to mark them `corroborated`. Two independent lenses landing on one defect is the strongest signal a hunt produces, and it is computed, not left to the report to notice.

**What this does not fix, and the honest size of it.** The enum makes `flaw` unphraseable; `file` snaps to the muster where it can; `symbol` and `subject` are still model-authored strings. Drift is now bounded and discrete rather than unbounded — two hunters can still split `unhandled-failure-path` / `broken-invariant` / `data-loss` on one bug, or name a subject `lodash` and `lodash@4.17.20`. **Drift's** consequence is a duplicate, never a silent drop, which is the direction this file takes every time it has the choice; `norm()` also strips colons, since the key is colon-joined and a subject like `http://internal:8080` would otherwise shift the field boundaries of the one string compared exactly.

The failure that drift *cannot* produce but under-specification can is a **merge**: two genuinely different flaws given identical identity fields collide into one id, and the second is dropped as already-known. That is why `subject` is `minLength: 1` rather than "empty if the symbol suffices" — the escape hatch was the merge, wearing convenience. It is not eliminated (a model can still write a uselessly generic subject), but it now takes an actively bad answer rather than a permitted one. `other` keeps `lens` in its key for the same reason: two lenses finding two unclassifiable defects at one location must not become one line.

## Severity — what earns the horn

Only `critical` and `high` are reported by default (`severity=` widens it). The floor exists because the value of an hourly report is inversely proportional to how much of it the user can skip.

| | Means |
|---|---|
| `critical` | Exploitable now by an untrusted party, or silent data loss/corruption in a normal path. Wake someone. |
| `high` | Real flaw with a proven failure path, but needs a precondition (a role, a config, a race window). |
| `medium` / `low` | Recorded in the hunt document and the ledger with the fingerprint; not reported through the channel unless asked. |

Sub-floor findings are filtered at the **report**, never at the hunt — the ledger has to know about the medium today for the script to recognize it as the same thing when it becomes a critical next month.

## Report — the configured channel

`report=` picks how findings leave the Hunt. Every channel gets the same body: what, where (`path:symbol`), the failure path, the evidence, severity, fingerprint, which refuters survived, and the lenses that ran.

| `report=` | Does | Use when |
|---|---|---|
| `document` (default) | Appends a dated hunt to `<state root>/<date>-<n>.md` + `INDEX.md` — the **state root**, which on a public repo is not in the repo (§ Where the state root is) | the normal cadence — a logbook the user skims, nothing pushed at them |
| `issues` | Files each finding as a tracker ticket, labeled `ai-ready` (§ Handing findings to the patrol) | you want the finding *fixed*, not just known |
| `pr` | Opens one PR carrying the hunt document (docs only — Hunt rule 1 stands) | the team reviews security in PRs and wants a comment thread |
| `advisory` | Drafts a GitHub security advisory (`gh api .../security-advisories`) | the repo is public and the finding is a real vulnerability — see below |
| `chat` | Returns the findings to the user in-session | `once` runs, or a human is actually watching |

A hunt that found nothing still writes its one-line document entry — and advances the watermark **if it was `complete`** (§ Events). A silent hunt and a broken hunt look identical, and the user must be able to tell them apart.

### Disclosure (Hunt rule 4, concretely)

This rule is the Hunt's only original one, so it is the one place where prose is least excusable — but it is also the watcher's job, not the workflow's: the script hunts and returns findings, it never writes a channel. So the rule is an **ordered gate at the top of the hunt, before dispatch**, and the watcher takes it in this order or does not hunt:

**Step 0 — resolve visibility.** `gh repo view --json visibility`. This runs *before* the muster, and its result is passed into the workflow as `args.visibility`, so no agent has to guess and the report can state it. **Unresolvable visibility is treated as public** — the one safe default, since guessing wrong in the other direction publishes a vulnerability.

**Step 1 — place the state.** Public → the state root is `~/.nights-watch/<repo-slug>/` (§ Where the state root is). This is not a gitignore: an ignored file still lives in the tree, one `git add -f` or a tooling change from being published, and it silently loses the properties rule 3 depends on. The root moves out of the repo entirely, which is the only version of "not published" that doesn't rely on anyone remembering.

**Step 2 — route the finding.** On a public repo a real vulnerability goes to `advisory` — a private draft on the repo, where a fix and a CVE can follow. This **overrides `report=`**, whatever the user configured, including `issues` and `pr`. If advisories are unavailable (no permission, not GitHub), the fallback is `chat` — tell the human directly and write nothing down. There is no path where "the channel was unavailable" ends with the finding published.

**Step 3 — say so.** The report states plainly that a finding was withheld from the configured channel and where it went. A withheld finding the user never hears about is the same as no finding.

Non-vulnerability findings (the `correctness` lens) carry no disclosure risk — normal channel. On a private repo all channels are in-house and none of this applies.

### Handing findings to the patrol

`report=issues` is where the two modes meet. A hunt finding is a good ticket by construction — it already has an observable outcome, a repro, and a scope — so it tends to sail through the readiness gate ([TRIAGE.md](TRIAGE.md)) that a hand-written "improve error handling" ticket fails. File it with the failure path, the evidence, the fingerprint, and label it `ai-ready`; the next patrol triages, tiers, and works it under the full gate, grill included.

Two guards on the seam. The ticket **must** carry the fingerprint — that string is the only thing connecting a closed ticket back to its ledger line, and without it the fire cannot mark the entry `fixed`, which is what turns a later reappearance into a regression rather than news (the ledger line stays `reported`, so rule 3 keeps deduping it; the ticket is the *only* channel that ever reports a fix back). And on a public repo an issue is a disclosure, so a real vulnerability goes to `advisory` no matter what `report=` said.

## Dispatch — the hunt workflow

The hunt runs as a **Workflow** — [`.claude/workflows/hunt.js`](../.claude/workflows/hunt.js), with its tests beside it in [`hunt.test.js`](../.claude/workflows/hunt.test.js). It is a real file rather than a template to copy, for the same reason `model-bake-off` is: this mode's load-bearing rules are structural, and prose cannot enforce them. The watcher musters cheaply first (a `git log --name-only`) and returns early on an empty delta — the workflow is for hunting, not for discovering there is nothing to hunt.

Its contract, which is all the watcher needs to know:

```js
// in:  { range: 'abc123..def456',                  // BOTH ends explicit SHAs, never HEAD — hunters
//                                                  // run in worktrees where HEAD means something else
//        files, manifests, logsCmd,                // NAMES only (Oath rule 2), capped by the watcher
//        visibility,                               // resolved at step 0, BEFORE the muster
//        lenses, tiers,                            // what the delta triggers; rubric picks the tier
//        known: { '<fingerprint>': 'high' },       // ledger status=reported ONLY — never pending
//        fixed: ['<fingerprint>'],                 // ledger status=fixed — a reappearance is a regression
//        carry: [{...finding, id, range, attempts}],   // carry.jsonl — found earlier, still unrefuted
//        startedAt: '07-20 09:30',                // the watcher's clock at dispatch — the script has
//                                                 // none (Date.now() throws). WATCH.md § Stamped output
//        maxFindings: 8, maxCarry: 24, maxAttempts: 3, reserve: 40000, chronicleDir, libraryIndex }
//
// out: { confirmed,        // survivors, worst-first, with repro/escalation/regression/corroborated
//        accountedFor,     // THE fire's answer: every id this hunt can account for, one flat list
//        deferred,         // found, unrefuted — the fire rewrites carry.jsonl from exactly this
//        uncovered,        // a lens that never ran — the ONLY thing that holds the watermark
//        stillPresent, refuted, dropped,   // the other ways out of `confirmed`, for the report
//        lensesRun, complete, range, visibility }
```

Two of those outputs are the whole reason the script exists rather than a prompt. **`accountedFor`** is the union of every id the hunt can explain, computed in JS so the fire tests `!accountedFor.includes(id)` once instead of re-deriving a union across five arrays holding three element types — ids, whole candidates, and prose lines — where `.includes(id)` silently answers *false* for the object arrays and marks live findings fixed. **`complete`** is the watermark's gate: true only when every triggered lens actually examined the delta.

> **`scriptPath`, not `{name:}`** — the same trap [WATCH.md](WATCH.md) hit with the workhorse, and the Hunt is more exposed to it: named resolution reads `.claude/workflows/` **in the repo being hunted**, which is essentially never this one. Dispatch with an absolute `scriptPath` to this repo's copy. A hunt that can't resolve the script reports the failure and stands down — it does not improvise a party from the prose above, because an un-run gate is visible and a re-invented one is not.

**Verify the seam, not the rule.** Every serious bug this mode has had was the same one: a correct rule, defeated where it was invoked. `triage()` called one line before the id it reads existed. `afford()` checked inside a fan-out where nothing had spent yet. `known` fed `pending`, so a crash buried a finding forever. Absence from `confirmed` read as a fix. Five exclusion sets the fire couldn't uniformly test. Not one of those rules was wrong, and every one of them read fine. They failed at the joint — and a unit test of the rule passes cheerfully while the seam is broken, because it calls the rule the way the rule wants to be called. So: when changing this script, drive it end to end and assert on the **return value** — that a known finding lands in `stillPresent`, that a killed one lands in `refuted`, that a dead lens is absent from `lensesRun`. Then break the fix on purpose and watch the test fail. A test that has never failed is a decoration.

Why the script is shaped the way it is — read these before changing it:

- **Muster before you dispatch.** The watcher runs `git log --name-only` itself and returns early on an empty delta, so a quiet hour spawns no agents. It passes names, not diffs — Oath rule 2 holds on a hunt, and each hunter reads the delta once inside its own context instead of the watcher paying for it six times over.
- **`pipeline`, not a barrier.** A lens's findings go to refuters the moment that lens finishes; a slow `supply-chain` lens waiting on an advisory lookup doesn't hold `injection`'s candidates hostage. The second stage takes `(prevResult, originalItem)` — `originalItem` is the lens, which is what the fingerprint needs.
- **`claim()` is admission control, not a spend check.** The guard reserves at *spawn* rather than reading `budget.remaining()` after the fact. That distinction is the whole thing: `pipeline` starts every lens at once, so six concurrent reads of a counter no sibling has moved yet all pass, and the guard waves through the wave it was meant to bound. Reserving is serialized by JS's single thread — the six `claim(1)` calls see each other's `committed` — which is the same shared-mutable-state-across-the-fan-out that `uncovered` already relies on. WATCH.md's `if (remaining < reserve) break` works there because its pool is a *sequential* `while`; copying the line without the loop copies the look of a guard. It claims `3` because it is about to spawn three agents — reserving one unit for three workers is arithmetic that flatters itself. And note what reserving-at-spawn buys: the refuter fan-out needs no serialization, so both call sites (`carry` and each lens's triaged candidates) run in `parallel` and the hunt doesn't crawl toward `lockTtl` for a guard that no longer requires it. A sequential loop here would be a leftover from the version of the guard that read a lagging counter.
- **`uncovered` and `deferred` are different failures and must not share an array.** `deferred` = found but not refuted (over `maxFindings`, or under reserve): the delta *was* examined and the candidate is banked whole in `carry.jsonl`, so the next hunt refutes it without re-hunting. `uncovered` = a lens never ran: those commits were never seen through that lens at all. Only `uncovered` holds the watermark. Gating on both livelocks — a lens that reliably finds 9 candidates caps every hour, never advances, and re-hunts the same delta forever, paying six hunters each time. Gating on neither loses coverage silently. Either way, everything cut is named in the report: Oath rule 7 applies as hard to a cap as to a crash.
- **`carry` is bounded, re-triaged, and deduped — it is a queue, and queues rot.** Three guards, none optional: `maxAttempts` (default 3, matching the Watch's two-strikes discipline in [TRIAGE.md](TRIAGE.md) — a candidate that keeps being deferred is telling you something a fourth attempt won't), `maxCarry` (default 24, or a lens finding 20 an hour defers 12 an hour forever and the bank grows without limit), and a re-run of `triage()` on the way in, because the ledger moved on while the candidate sat there — it may have been reported, fixed, or escalated by another route. Then `confirmed` is deduped **by id**: a carried candidate whose file this delta touched gets found again by its own lens, and one flaw must not be refuted twice, reported twice, or — worst — counted as its own corroboration. Corroboration requires **distinct** lenses; a lens agreeing with itself is a duplicate wearing the strongest signal the hunt has as a disguise.
- **A carried candidate is refuted against the range it was found in**, not this hunt's (`f.range ?? args.range`). Telling a refuter the finding lives in a delta that doesn't contain it points the reachability and repro angles at the wrong code and gets a real finding killed for the wrong reason. And a refuter that finds the code *gone* is told to say so: that is a fix, and the fire reads it as one — otherwise the calibration data records "this lens produces noise" every time somebody fixes something, which would eventually retire the lens for working.
- **Dedup is a comparison, before the refuters.** Stage two triages against `known` *and* `fixed` before spending anything: same-or-lower severity → dropped silently; worse → an escalation; a fixed finding come back → a regression. Filtering on membership alone would be cheaper and would make rule 3's two exceptions unreachable — the drop would eat the very candidate carrying the news. And `known` is `reported` lines **only**: feeding it `pending` turns a crash into a permanently buried finding (§ Statuses).
- **`canonFile()` canonicalizes; it does not gatekeep.** Hunters run in worktrees whose absolute path differs every run, so a raw `file` string is the least stable part of the fingerprint — `args.files` is the watcher's own muster and therefore the canonical spelling, so a match snaps to it. But **a path outside the muster is expected, not an error**: hunters are told to follow callers, and rule 5 puts "what the change touches" in scope, so a finding in an untouched caller is exactly the finding the delta's context was supposed to surface. Rejecting it would discard a real vulnerability *and* — if that rejection landed in `uncovered` — freeze the watermark forever, re-finding and re-rejecting it every hour. So out-of-muster paths are kept and marked `pathVerified: false`; only a path that isn't repo-relative at all (a leaked worktree absolute, a `..` escape) is logged as malformed, and even then the finding is reported rather than dropped. The hunter is asked to run `git ls-files --error-unmatch` first, which is the cheap check at the only place that can actually do it. This is also why `range` must be two explicit SHAs: `HEAD` means something different inside a worktree than it did at the muster, and a hunter diffing a range nobody mustered would advance the watermark over commits nobody read.
- **The refuters are the product.** Three angles per finding is the whole reason an hourly security job is worth reading. Cutting to one vote to save tokens returns the Hunt to a noise generator — cut the *cadence* instead. Only *surviving* refuters rate the severity: a refuter who says "not real" has no opinion worth ranking about how bad it is.
- **`isolation: 'worktree'` on both stages.** Refuters exist to run repros, and hunters are told to prove claims with runnable experiments (`fact-check`) — that is executing code, whatever the stage is called. Six hunters and every refuter triple run concurrently, possibly while the user is editing that tree, which is exactly WATCH.md's condition for isolation ("workers mutating the same repo concurrently"). Isolating only the stage that admits to executing would leave the other one executing anyway.

## Pacing, the lock, and standing down

The Hunt runs on the cadence the user set (`every`, default `1h`) — a `/loop` interval, a scheduled agent, or cron. Unlike the patrol it does not self-pace: "hourly" is a promise about coverage, and a self-pacing hunt that decided the repo was quiet would break it silently.

- **The lock replaces the claim.** A patrol claims tickets, and the claim is what stops two watchers double-working one; a hunt claims nothing, so it takes a lock. `mkdir <state root>/.lock` — a **directory**, because `mkdir` fails atomically when one exists and check-then-write does not: two ticks (a cron plus a manual `once`, two loops) can both observe an absent file and both create it. Write `owner.md` inside it (ISO start, range, host) for the human who finds it. A timer that fires while the lock stands **skips the tick and logs it**.
- **Staleness is measured in duration, not cadence.** A lock is stale past `lockTtl` (default **90 min**, and it must exceed the longest hunt you actually run, not the gap between hunts). Keying it to `2 × every` breaks live locks precisely where the lock matters most: at `every=15m`, a six-lens party with worktree-isolated refuters routinely outruns 30 minutes, so the third tick would declare a *healthy* hunt dead, break its lock, and start the concurrent double-report the lock exists to prevent — via the recovery path. Nothing here distinguishes a slow hunt from a dead one; a generous TTL means a genuinely crashed hunt costs a delayed hunt rather than a corrupted one. If your hunts approach the TTL, the party is too big for the cadence — that is the signal, not a knob to tighten.
- **The lock is released on every exit path**, not just the happy one: after the watermark, on a blocker, on a stand-down (where the watermark deliberately does *not* advance), and on a throw. The TTL is the backstop for the crash that skips all of them, not the release mechanism.
- **The lock is local.** On a public repo, so is all the other state, so two clones on two machines cannot exclude each other — see § Where the state root is. That is the trade being made, not a hole nobody noticed.
- **Budget guard** → the watcher sizes the wave, and `claim()` admits (see § Dispatch); reserve ~40k per lens ([WATCH.md](WATCH.md) § Token watching). A lens that never ran lands in `uncovered` and holds the watermark back; a candidate found but not refuted lands in `deferred` and is carried to the next hunt. The report names both.
- **Stand down** on the user's word or an exhausted target. Nothing is claimed, so no ticket needs releasing — but "the watermark is the only state" is no longer true: there are four artifacts (`state.md`, `ledger.md`, `carry.jsonl`, `.lock/`), and a stand-down mid-hunt must release the lock, or the next hunt skips ticks until the TTL breaks it.

## The fire

Every hunt that dispatched a party closes with the gathering ([LIBRARY.md](LIBRARY.md)) — chronicles read, durable lessons curated into the Library — plus the Hunt's own five. Only the last is a Library entry; the rest are operational state, and the fire is merely where the write sequence *ends*, not where it starts:

- **The ledger is settled** (`ledger.md`): pending lines written before the report (§ Statuses) become `reported`, and sub-floor findings keep their line so a medium that becomes a critical is recognized as the same flaw.
- **`carry.jsonl` is rewritten** — survivors only: this hunt's `deferred`, minus anything now refuted, reported, or abandoned. Rewritten, never appended (§ Statuses), because `maxCarry` and `maxAttempts` both read this file and both invert if it accumulates.
- **`fixed` is *produced*, and only by a positive signal.** A status nothing writes makes rule 3's regression exception dead code that looks alive. But the tempting producer is a trap: *"the lens ran and the fingerprint isn't in `confirmed`"* marks every open finding fixed the moment anything else in its file changes — because rule 3 **drops still-present findings before they can reach `confirmed`** (that is rule 3 working: the hunter just saw it, it is still there). Absence from `confirmed` is not evidence of a fix; the fire would mark it fixed, and the next touch of that file would report a *regression against a fix that never happened*. That is the false-alarm generator rule 2 exists to prevent, assembled out of two rules agreeing with each other. So the workflow returns **`stillPresent`** — the ids it dropped — and the fire uses:
  1. **The channel reported closure back.** The tracker issue carrying the fingerprint was closed (`gh issue list --state closed`), or the advisory was closed/published. This is the only *direct* evidence, and it exists only on `issues` and `advisory`.
  2. **The lens re-examined and the flaw was gone**: the entry's file was in this delta, its lens **actually ran** (`lensesRun` — recorded from hunters that returned and stages that finished, never inferred from an absence of complaint), and **`!accountedFor.includes(id)`**.

  That single test is the whole producer, and it is a single test on purpose. There are four distinct ways for an id to be absent from `confirmed` while being anything but fixed — still there (`stillPresent`), not yet judged (`deferred`), judged unreal (`refuted` — *not* fixed; it was never a flaw), or abandoned by a carry bound (`dropped`) — and the arrays holding them carry three different element types, because each also feeds the report: ids, whole candidates, and prose lines a human reads. An agent handed those five arrays and told "the id is in none of them" will reach for `.includes(id)` and get *false* from every array that holds objects or sentences — which reads as "not accounted for", which marks a **live** finding fixed and reports the next sighting as a regression against a fix that never happened. That is not a hypothetical; it is this design's oldest bug wearing its fifth disguise. So the script unions them into `accountedFor` — one flat list of ids — and the fire tests that. **Never infer a fix from silence**, and never ask prose to do set arithmetic across types.

  The maintenance contract: a sixth way to leave `confirmed` joins the `accountedFor` union in the script. Not this paragraph.

  Neither signal exists for an entry whose file nobody touched, so it stays open — untouched code doesn't fix itself. On `document` and `chat` there is no back-channel at all, so producer 2 is the only one, and a finding in code nobody revisits stays `reported` indefinitely: rule 3 keeps deduping it, which is right (it's still there) but means the ledger's `fixed` lifecycle is only as good as the channel. That's a real limitation of the cheap default, and it is the reason to run `issues` on anything you intend to actually fix. A finding the *refuters* killed is never `fixed` — it was never real, and it leaves by another door.
- **The watermark advances** (`state.md`) — only if the workflow returned `complete`, i.e. every triggered lens ran. A hunt that skipped a lens for budget leaves it alone deliberately: the delta must be re-covered, and no report line the user skims is a substitute for looking.
- **What the refuters killed** is the most valuable output nobody asks for, and it *is* a durable fact — a Library `calibration` entry. A lens whose findings die 90% of the time is producing noise: fix its prompt (`evolve-skill`), or stop running it on this repo. A lens that never fires on a repo that clearly has that surface is the more dangerous signal — it is not evidence of safety. A vocabulary that keeps forcing hunters to `other` belongs here too: that is the taxonomy asking for a word.

A hunt over an empty delta skips the fire entirely. There is nothing to remember about an hour in which nothing happened.
