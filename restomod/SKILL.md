---
name: restomod
description: Revive a dormant or neglected codebase without breaking its consumers — classic API, modern engine. Deep read-only review, fix correctness bugs with regression tests, modernize the toolchain/deps to a warning-free build, deprecate-don't-break for misleading APIs, then ship behind green CI. Language- and registry-agnostic; downstream skills layer ecosystem specifics (e.g. refresh-nuget-repo for .NET/NuGet). Use when asked to revive, refresh, modernize, refactor, harden, or "bring an old library back to life", or to run a disciplined correctness + modernization pass on a repo.
---

# Restomod — classic API, modern engine

Revive a tired codebase the way a restomod revives a classic car: keep the shape its
users depend on, rebuild the guts to modern spec, and never break the thing that drives.
Work in phases; keep the build green at every commit; never break consumers silently;
stop at each **🛑 GATE**.

> **Ecosystem specializations.** This is the generic engine. A downstream skill layers
> per-phase deltas for a specific stack/registry (e.g. **`refresh-nuget-repo`** adds the
> .NET/NuGet divergence check, packaging, and Trusted-Publishing CD). If one is in play,
> run these phases and apply that skill's deltas where it names them.

## Operating rules
- **Never work on the default branch.** Get a clean tree first, then branch.
- **Verify every claim by building and testing** — never assert a bug, or a green pipeline,
  you did not actually observe.
- **Don't hardcode "latest".** Query current versions of toolchains, deps, and CI actions so
  the workflow stays current over time.
- **One logical change per commit**; build+test before committing. Push / open PR / tag /
  release **only when the user authorizes** — those are gates.
- **Deprecation beats breakage.** A behavior change with no compile-time signal is the worst
  possible outcome.

## Resume — find the current phase
Resumable. Read: branch & git cleanliness, toolchain/target version(s), whether tests pass,
whether CI exists, release/version state, and open/closed issues. Map the result to the first
incomplete phase below and continue. Re-entering a finished phase must be a no-op.

## Phases

**0 — Clean git state.** Resolve any in-progress merge or diverged branches (`git status`;
conclude or abort), then `git checkout -b refresh/<topic>`. → REFERENCE "Phase 0".

**1 — Baseline + deep review (read-only). 🛑 FIRST: source-of-truth / divergence check.**
Before reviewing anything, confirm the repo really is the source of the published/deployed
artifact. If a registry or deployment has content *newer than* or *different from* this tree,
the repo is **stale/diverged** — its real source was likely shipped from an unpushed working
copy. **STOP and reconcile the real baseline first** (→ REFERENCE "Phase 1 — divergence");
refreshing a stale tree silently reverts real API/behavior and breaks consumers. (A downstream
skill supplies the concrete registry check.)

Then read **all** source + tests, build + test for a baseline (record pass/fail count **and**
warning count). List findings with `file:line`, grouped: **P0 repo state · correctness bugs
(wrong results) · breaking API/naming bugs · robustness/edge cases · maintenance/modernization**,
plus **priority wins** (high value, low effort). Deliver the prioritized report **before**
touching code. Bug-pattern checklist → REFERENCE "Phase 1".

**For every finding, name the test that proves it** (a case that currently fails, or a
currently-passing test that would survive a broken implementation). Scan for **public members
with no meaningful coverage** and plan those too. **Flag tests that pass by coincidence:** a
wrong formula that happens to return the right answer for the chosen inputs. Mentally break the
implementation and ask *"would any test fail?"* — if not, the test is hollow (→ REFERENCE
"Phase 1 — coincidence-passing tests").

**2 — Non-breaking correctness fixes.** Land each fix **with a regression test** (red before,
green after). No public API changes here. Keep build green.
**Validate every closed-form / analytic property against brute-force enumeration over
NON-trivial inputs** — not just the happy path. A fix that only satisfies the aligned/simple
case can still be wrong off it (e.g. a mean coded as `(min+max)/2` is wrong whenever the last
element falls below `max`; the true mean is `min + (count-1)*step/2`). Keep related properties
mutually consistent (e.g. `Average == Sum/Count`, variance taken about that same mean).

**3 — Modernize.** Bring the toolchain, language level, and dependencies to current supported
versions (verify latest — don't hardcode). Centralize/lock dependency versions so future bumps
are one-line and can't drift across projects. Fix docs/README to the *current* public surface
with working, compiling examples.
**REQUIRED — drive compiler/build warnings to zero, every project, every target.** Not optional,
not "the easy ones": a restomod does not ship with warnings. Do a clean release build of the
whole solution and **count** them — target is literally `0`. Fix every one (prefer fixing over
suppressing; only suppress with a written justification). **Then lock it in so warnings can't
silently return** (`TreatWarningsAsErrors` / `-Werror` / equivalent) and rebuild clean — a later
phase's CI relies on this to fail on any new warning. Stack/registry specifics (multi-targeting,
packaging metadata, polyfills, badges) come from the downstream skill.

**4 — Breaking fixes. 🛑 GATE.** For inverted/misleading APIs, do **not** flip behavior silently.
Present options and **ask the user**. Default: add correctly-named replacements; keep the old
names as deprecation shims with **unchanged** behavior; bump the **major** version; move internal
callers onto the new member; keep a test pinning the shim's old behavior. → REFERENCE "Phase 4".

**5 — Issues.** File issues for deferred findings (use the `to-issues` skill if available). Close
existing issues this work resolves, with a comment linking the PR/version.

**6 — CI. 🛑 GATE on trigger model.** Add/upgrade CI: restore → build (all targets, release) →
**test**, on push to the default branch + PR + manual dispatch. Least-privilege job permissions;
pin every CI action/image to a current, supported version (verify latest). **Verify the exact
command sequence locally**, and confirm committed workflow files are **LF with no UTF-8 BOM**
(`git show HEAD:<file> | grep -c $'\r'` → `0`; first three bytes not `EF BB BF`). Release/publish
automation (CD), registry auth, and static-analysis wiring are supplied by the downstream skill.

**7 — Security & quality bar.** No long-lived secrets; least-privilege CI `permissions:`;
deterministic restore-then-build; dependency hygiene (no EOL/abandoned deps, no known-vulnerable
pins); don't pull a heavy dependency for one helper. Checklist → REFERENCE "Phase 7".

**8 — Ship & verify. 🛑 GATE on outward-facing actions.** Push branch, open a PR with a structured
body (what/why per finding), confirm CI green **on the PR**. Merging, tagging, and any release to
a public registry are the user's calls — **offer, don't auto-run**. After a release, confirm it
landed (downstream skill supplies the registry-index check).

See [REFERENCE.md](REFERENCE.md) for per-phase detail.
