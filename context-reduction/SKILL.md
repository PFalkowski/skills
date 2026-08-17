---
name: context-reduction
description: 'Shrink a repository''s prose — comments, docs, agent artifacts — by DELETING it, not by layering summaries, indexes, or knowledge graphs on top. Real context reduction moves truth into code, tests, and git history, then removes the prose; derived layers are anti-reduction (a second copy that drifts out of sync). Runs as a gated campaign: drift scan → sole-record register → pin with tests → mass delete → re-accumulation guard. Use when a repo''s docs/comments have outgrown their value, when someone says "context reduction", "prune the docs", "too many comments", "the wiki is stale", or proposes a knowledge base / graph DB / doc-summary layer to "manage" documentation — this skill is the counter-proposal. Distinct from no-comment (the single-comment decision this skill applies at scale) and housekeeping (audit without the deletion campaign).'
---

# context-reduction

Prose has two costs: it drifts and then lies, and it burns reading budget (human or
context-window) before anyone reaches the code. The only reduction that is real is
**deletion** — making code, tests, and git history the record, then removing the prose.

**The anti-pattern this skill exists to refuse:** adding a derived layer — knowledge
graph, doc index, summary-of-docs, "archive" folder. Every derived layer is a second
copy of the truth with no mechanism keeping it honest. It grows, drifts, and gets read
as authoritative precisely when it is most wrong. An archived doc is still in the
search path; a graph node still answers queries after the code moved on. Layers are
negative reduction. (Evidence: in the XtbClient campaign, every costly lie lived in a
derived layer — ADR summaries in comments, config values quoted in prose, a curated
fact-library asserting a branch was unprotected after protection shipped.)

## Where truth is allowed to live

| Truth | Owner |
|---|---|
| What the code does | the code |
| That it keeps doing it | a test (ordinary > architecture > characterization pin) |
| What it used to do, and why it changed | git history — never inline changelog |
| A value | its config file, one place; everything else points |
| A decision | one ADR; link it, never summarise it |

Prose survives only where none of those can hold it: a trap (the obvious approach
fails non-obviously), an external constraint invisible in code (cite the source), a
destructive-operation warning, or a one-line pointer to the owner above.

## The campaign (each stage gates the next)

1. **Drift scan.** Classify every claim: *drifted* (false — fix at source with a
   one-line marker, or delete), *duplicated* (name ONE owner; every copy becomes a
   pointer or dies), *sole record* (true, not derivable from code, recorded nowhere
   else), or keep-worthy under the bar above. Read the code before opening a finding —
   findings dissolve on contact with the actual file. History is not drift: dated
   records and ADRs are immutable; a superseded ADR gets a marker, never a rewrite.
2. **Sole-record register.** The load-bearing step. A sole record deleted before it is
   pinned is destroyed — invisibly, because no build reaches untested behaviour. List
   each: the claim, where the behaviour lives, whether a test can reach it.
3. **Pin.** Per sole record, one recorded disposition: already-tested / ordinary test /
   architecture test / characterization pin / *neither, with the reason*. Gate: zero
   blank rows. Often most are already pinned — verify by reading the assertion, not by
   coverage numbers.
4. **Delete.** Only now, and delete-first: **removal is the default; compression is the
   exception**, reserved for unambiguous allowlist content at 1–2 lines. Do not keep a
   trimmed version of restatement or history because effort went into writing it.
   Comment-only / prose-only diffs; zero behavioural change; build and tests green.
   Mass deletion needs an explicit human go — never on the agent's own gate-reading.
5. **Guard.** Re-accumulation is silent, so the guard must be executable, not a
   checklist line: a comment-share (or doc-size) threshold script wired into CI, and
   the scan registered as a recurring process. A prose rule about prose will drift too.

## Working rules

- Delete, don't archive.
- A comment may not assert the behaviour of code it does not sit on — if the claim
  matters, write the test.
- Fix drift at its source, never by adding a correcting layer next to it.
- Session artifacts (run logs, handoffs, scratch briefs) that nothing reads back are
  deletable without stage 2–3: they record process, not behaviour.
- Measure before and after with the same script the CI guard runs.
