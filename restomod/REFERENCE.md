# Restomod — reference

Per-phase detail for [SKILL.md](SKILL.md). Read the phase you're on; don't front-load it all.
Stack/registry-specific recipes live in the downstream skill (e.g. `refresh-nuget-repo`).

---

## Phase 0 — Clean git state

```bash
git status                       # diverged? in-progress merge? untracked junk?
cat .git/MERGE_HEAD 2>/dev/null  # exists => a merge is mid-flight
```
- **In-progress merge:** inspect what it does. If the result equals HEAD (`git diff --stat HEAD`
  empty), it's a no-op — conclude it (`git commit --no-edit`). Otherwise resolve deliberately or
  `git merge --abort`.
- **Diverged from origin:** understand both sides (`git log --oneline --graph --all`) before
  reconciling.
- Only once clean: `git checkout -b refresh/<topic>`. Never commit refresh work onto the default
  branch.

---

## Phase 1 — divergence / stale repo (CHECK FIRST, before any review)

Confirm the repo is actually the source of the published/deployed artifact. The downstream skill
supplies the concrete check (query the package registry / deployment for the current version and
content). The principle is universal:

If the live artifact is at a version *above* the repo's, or the same version is published with
**different content**, the repo is **stale**: development continued in a working copy that was
shipped but never pushed. **Do not refresh or release the stale tree** — it would revert real
API/behavior and break consumers.

Reconcile before refreshing:
1. **Find the real source** — ask the user; search disk and other clones/backups. Check local
   *consumers* to learn which members are load-bearing.
2. **If the source is lost, reconstruct from the published artifact** (decompile/unpack the
   shipped package), use that as the baseline, **re-apply the still-relevant fixes** (the shipped
   build usually still has the bugs), keep the infra refresh, and ship a version **above** the
   highest published one.
3. **Verify superset-compatibility**: compare the public surface of the shipped artifact against
   your rebuilt one so no public API is dropped (that would break consumers).

> Lesson (seen in the wild): a repo sat at an older version while the registry already had a
> **higher major** — a renamed core interface plus new methods, consumed across many sibling
> repos. The refresh was nearly published from the stale tree — caught only by checking the
> registry. This check is non-negotiable and first.

## Phase 1 — Deep review: recurring bug patterns

Read **all** source and tests. Build + test for a baseline (note pass/fail count + warning
count). For each finding give `file:line` and **prove it** (a failing case, or a test you'll
add). Patterns that recur in old utility code (examples in C#, but the shapes are universal):

**Correctness (wrong results):**
- **Accumulator overwritten in a loop** (`result = f(x)` instead of `result &= f(x)` /
  early-return) — only the last element decides the answer.
- **Wrong cast on boxed values** (e.g. `Cast<double>()` over boxed `int`/`float` → runtime cast
  error). Use a converting projection.
- **Inverted/mislabeled interval logic** (a "closed" range using `>`/`<`); endpoint off-by-one.
- **Lookup/format ladders that drift from their data tables** — wrong divisor or unit at the high
  tiers (often untested because the values are huge). Drive formatting off the table.
- **Double-enumeration**: materialize the sequence once, then compute off the materialized copy,
  not the original lazy source.
- **Encode/decode pairs that don't round-trip** (packed in a different order than unpacked). Add a
  round-trip test.
- **Integer division / truncation where a fraction was intended**; unsigned conversion of a
  negative → overflow/wraparound.

**API / naming (breaking to fix — defer to Phase 4):**
- Method/parameter names that contradict behavior (`angleDegrees` used as radians; an
  `InClosedRange` that excludes endpoints).

**Robustness / edge cases:** empty-sequence `Max()`/index `[0]`, null guards, divide-by-zero →
`NaN`/exception, silent truncation to the shorter of two sequences.

**Maintenance / modernization:** EOL toolchain/target, stale deps, false compile constants,
missing docs, packaging gaps, analyzer/linter warnings, dead code, a heavy dependency pulled in
for one helper.

### Phase 1 — coincidence-passing tests (flag these explicitly)
A wrong formula accidentally returns the correct value for the specific inputs chosen — the test
doesn't actually pin the behavior. To identify: mentally break the formula and ask *"would this
test fail?"* If not, it's hollow. Common patterns:
- An average `(max - |min|)/2` is right when `min = 0` or `min = -max` (symmetric) but wrong for
  any positive-only range like `[1,5]`.
- A "variance" that simplifies to the range is right only for the one element count where range
  equals population variance.
- Off-by-one errors that cancel out for the chosen step/count.
Always add at least one case that would fail if the formula were trivially broken (a positive-only
range for an average; a step ≠ 1 for a variance; an unaligned range for a mean).

Deliver a **prioritized report** (P0 repo state → correctness → breaking API → robustness →
maintenance) + **priority wins** *before* editing code.

---

## Phase 3 — Modernize: the zero-warning gate (generic)

Warnings are latent bugs and review noise; a restomod ships at zero. The mechanics differ by
stack, but the discipline is fixed:
1. Clean release build of the whole solution; **count** warnings — target `0`.
2. Fix every one. Prefer fixing over suppressing; suppress only with a written justification next
   to the suppression.
3. **Lock it in** so warnings can't silently return — enable warnings-as-errors
   (`TreatWarningsAsErrors`, `-Werror`, `--deny warnings`, strict lint config, etc.) and rebuild
   clean. From here, CI fails on any new warning — which is the point.

Centralize dependency versions (one manifest, not scattered per-project pins) so future bumps are
a one-line change and can't drift. Refresh docs/README to the *current* public surface; every
example must compile against the real signatures.

---

## Phase 4 — Breaking fixes via deprecation shims (default strategy)

Don't change the behavior of an existing name. Instead:
1. Add a correctly-named member with the right behavior.
2. Keep the old name, behavior **unchanged**, marked deprecated with a message pointing at the
   replacement and naming the removal horizon (e.g. C# `[Obsolete("why; use <new>; removed in a
   future major")]`; equivalents: `@deprecated`, `@Deprecated`, `#[deprecated]`).
3. Move internal callers onto the new member (so the lib doesn't warn against itself).
4. Bump the **major** version.
5. Tests: cover the new member's semantics; keep a test (suppressing the deprecation warning)
   exercising the old shim so its behavior stays pinned — e.g. in C#:
   ```csharp
   #pragma warning disable CS0618
      // assertions calling the [Obsolete] member
   #pragma warning restore CS0618
   ```
Always present the options and let the user pick (shim vs. outright rename vs. document-only vs.
defer).

---

## Phase 7 — Security & quality checklist

- [ ] No long-lived secrets in CI/CD (prefer short-lived/OIDC credentials).
- [ ] Least privilege: explicit job `permissions:` (`contents: read` + only what's needed; elevate
      a single job only where required, e.g. `id-token: write` on a publish job).
- [ ] No EOL toolchains/targets or EOL/abandoned dependencies; no known-vulnerable pins (run the
      ecosystem's audit, e.g. `dotnet list package --vulnerable`, `npm audit`, `cargo audit`).
- [ ] Deterministic, restore-then-build pipeline; tests gate every release.
- [ ] Don't pull a heavy dependency for one helper — prefer the standard library or a focused
      implementation.
- [ ] Package/release metadata complete: license, README, repo URL, symbols/docs.

---

## Phase 8 — Ship & verify

- Push branch; open a PR with a structured body (group findings; what + why).
- Confirm CI green **on the PR** (e.g. `gh pr checks <n>`) — don't assume; watch it.
- **Outward-facing actions are the user's call** — offer to merge/tag/release; don't auto-run.
- Before any release, run the downstream skill's pre-release verification gate (auth/secrets
  present, policy matches, release workflow exercised green at least once). A failed release is
  far more expensive to recover than a dry run.
- After a release, confirm it actually landed via the registry/deployment index (downstream skill
  supplies the exact check) — a successful push step plus a positive index lookup is the source of
  truth.
