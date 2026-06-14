# Refresh a NuGet/.NET library — reference

Per-phase detail for [SKILL.md](SKILL.md). Read the phase you're on; don't front-load it all.

---

## Phase 0 — Clean git state

```bash
git status                      # diverged? in-progress merge? untracked junk?
cat .git/MERGE_HEAD 2>/dev/null  # exists => a merge is mid-flight
```
- **In-progress merge:** inspect what it does. If the result equals HEAD (`git diff --stat HEAD` empty), it's a no-op — conclude it (`git commit --no-edit`). Otherwise resolve deliberately or `git merge --abort`.
- **Diverged from origin:** understand both sides (`git log --oneline --graph --all`) before reconciling.
- Only once clean: `git checkout -b refresh/<topic>`. Never commit refresh work onto the default branch.

---

## Phase 1 — divergence / stale repo (CHECK FIRST, before any review)

Confirm the repo is actually the source of the published package. `assess.sh` does this, or:
```bash
id=$(grep -oiE '<PackageId>[^<]+' path/to/Lib.csproj | sed -E 's/<[^>]+>//')  # or the csproj name
curl -s "https://api.nuget.org/v3-flatcontainer/${id,,}/index.json"           # all published versions
```
If the highest **published** version is *above* the repo's `<Version>` (or the same version is
published with different content), the repo is **stale**: development continued in a working
copy that was published straight to NuGet but never pushed. **Do not refresh or publish the
stale tree** — it would revert real API/behavior and break consumers.

Reconcile before refreshing:
1. **Find the real source** — ask the user; search disk (`grep -rl "interface I<Name>"`, other
   clones, cloud/backup). Check local *consumers* to learn which members are load-bearing.
2. **If the source is lost, reconstruct from the published package:**
   ```bash
   curl -s -o pkg.nupkg "https://api.nuget.org/v3-flatcontainer/<id>/<ver>/<id>.<ver>.nupkg"
   unzip -o pkg.nupkg -d extracted            # nuspec (release notes, TFMs) + lib/<tfm>/*.dll
   dotnet tool install -g ilspycmd
   ilspycmd extracted/lib/<tfm>/<Asm>.dll -o src -p    # per-type C# source
   ```
   Use the decompiled source as the baseline, **re-apply the still-relevant fixes** (the
   published build usually still has the bugs), keep the infra refresh, and ship a version
   **above** the highest published one.
3. **Verify superset-compatibility**: reflect both the published DLL and your rebuilt DLL and
   compare members so no public API is dropped (that would break consumers).

> Lesson (LoggerLite): repo was at 3.1.0; NuGet had **4.0.0** with `ILogger`→`ILoggerLite` + 3
> new methods, consumed 237× across sibling repos. The refresh was nearly published from the
> stale tree — caught only by checking the registry. This check is non-negotiable and first.

## Phase 1 — Deep review: common .NET library bug patterns

Read **all** source and tests. Run `dotnet build -c Release` and `dotnet test -c Release`
for a baseline (note count + warnings). For each finding give `file:line` and **prove it**
(a failing case, or a test you'll add). Patterns that recur in old utility libraries:

**Correctness (wrong results):**
- Accumulator overwritten in a loop (`result = f(x)` instead of `result &= f(x)` / early-return) — only the last element decides the answer.
- `Enumerable.Cast<double>()` on boxed value types (`int`/`float`) → `InvalidCastException`. Use `.Select(Convert.ToDouble)`.
- Inverted/mislabeled interval logic (a "closed" range using `>`/`<`); endpoint off-by-one.
- Lookup/format ladders that drift from their data tables — wrong divisor or unit at the high tiers (often untested because values are huge). Prefer driving formatting off the table.
- Double-enumeration: materialize once (`var arr = src as T[] ?? src.ToArray()`) then compute **off the materialized copy**, not the original lazy source.
- Encode/decode pairs that don't round-trip (bit packing in a different order than the unpacker). Add a round-trip test.
- Integer division / truncation where a fraction was intended; `Convert.ToUInt64` on negatives → overflow.

**API / naming (breaking to fix — defer to Phase 4):**
- Method/parameter names that contradict behavior (`angleDegrees` used as radians; `InClosedRange` that excludes endpoints).

**Robustness / edge cases:** empty-sequence `.Max()`/`[0]`, null guards, divide-by-zero → `NaN`, silent truncation to the shorter sequence.

**Maintenance / modernization:** EOL target framework, stale deps, false `DefineConstants`,
missing XML docs, packaging gaps, analyzer warnings, dead code, heavy dependency pulled in
for one method.

Deliver a **prioritized report** (P0 repo state → correctness → breaking API → robustness →
maintenance) + **priority wins** (high value, low effort) *before* editing code.

---

## Phase 3 — Modernization recipes

**Multi-target & language.** Verify the current .NET LTS first
(`gh api repos/dotnet/core/releases/latest` or docs). Then in the library `.csproj`:
```xml
<TargetFrameworks>netstandard2.0;net8.0</TargetFrameworks>  <!-- LTS: verify latest -->
<LangVersion>latest</LangVersion>                            <!-- so C# 8+ features compile on netstandard2.0 -->
<GenerateDocumentationFile>true</GenerateDocumentationFile>
<NoWarn>$(NoWarn);CS1591</NoWarn>                            <!-- ship XML docs without documenting every member -->
```
Remove bogus/false constants (e.g. a hand-set `NETSTANDARD2_0`), deprecated `PackageLicenseUrl`
(use `PackageLicenseExpression`). See `templates/csproj-snippet.xml`.

**netstandard2.0 polyfills** (these APIs are net6+/netstandard2.1+ only):
```csharp
// Random.Shared (net6+)
#if NET6_0_OR_GREATER
    private static Random SharedRandom => Random.Shared;
#else
    [ThreadStatic] private static Random _rng;
    private static Random SharedRandom => _rng ??= new Random();
#endif

// StringBuilder.AppendJoin  ->  sb.Append(string.Join(sep, items));
// Enumerable.ToHashSet      ->  new HashSet<T>(items);
```
`LangVersion latest` is what lets `??=`, `using var`, tuple deconstruction and `out var`
compile against netstandard2.0.

**Deps & packaging.** Bump packages to current (verify latest) and drive analyzer warnings to
zero (test-arg order, duplicate `InlineData`, unused fields). Build **and** test after each
change; keep it green.

**Bundle a README into the package** (shows on the nuget.org page; `dotnet pack` warns if
missing). Set the property and pack the file — the path is relative to the csproj, so a
repo-root README is `..\README.md`:
```xml
<PropertyGroup>
  <PackageReadmeFile>README.md</PackageReadmeFile>
</PropertyGroup>
<ItemGroup>
  <None Include="..\README.md" Pack="true" PackagePath="\" />
</ItemGroup>
```
Verify it landed: `unzip -l bin/Release/<id>.<ver>.nupkg | grep -i readme`.
Ref: https://devblogs.microsoft.com/dotnet/add-a-readme-to-your-nuget-package/

**Refresh the README content (mandatory).** A dormant repo's README is almost always stale,
and it now *is* the nuget.org package page — so fixing it is part of the refresh, not optional.
- [ ] **Badges**: replace the CI badge with the new GitHub Actions workflow
      (`.../actions/workflows/ci.yml/badge.svg`); drop dead ones (Azure DevOps, Codecov,
      `buildstats.info`); use shields.io for NuGet version/downloads/license; add the
      **SonarCloud quality-gate badge** if the project is analyzed (verify it returns 200 —
      see "Phase 6 — SonarCloud").
- [ ] **Always include the Buy Me a Coffee badge** (every repo, non-negotiable):
      `[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/piotrfalkowski)`
- [ ] **API accuracy**: reconcile every type/member named in the README against the *current*
      public surface (renamed interfaces, new methods). Verify each code example compiles
      against the actual signatures — don't trust the old prose.
- [ ] **Install snippet**: `dotnet add package <Id>`.
- [ ] **Working examples**: real, copy-pasteable; fix broken/truncated ones.
- [ ] **Absolute URLs for images _and_ links** — relative paths don't resolve on the nuget.org
      package page. Images: `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/img.png`;
      in-repo file links (LICENSE, docs): `https://github.com/<owner>/<repo>/blob/<branch>/FILE`.
- [ ] Fix obvious typos; state the supported target frameworks.

---

## Phase 4 — Breaking fixes via `[Obsolete]` shims (default strategy)

Don't change the behavior of an existing name. Instead:
1. Add a correctly-named member with the right behavior.
2. Keep the old name, behavior **unchanged**, marked `[Obsolete("why; use <new>; removed in a future major")]`.
3. Move internal callers onto the new member (so the lib doesn't warn against itself).
4. Bump the **major** version.
5. Tests: cover the new member's semantics; keep a (pragma-wrapped) test exercising the
   obsolete shim so its behavior stays pinned.
```csharp
#pragma warning disable CS0618
   // assertions calling the [Obsolete] member
#pragma warning restore CS0618
```
Always present the options and let the user pick (shim vs. outright rename vs. document-only vs. defer).

---

## Phase 6 — CI/CD detail

**CI** (`templates/ci.yml`): checkout → setup-dotnet (current LTS) → restore → build Release
(all TFMs) → test. Triggers: push to default branch, `pull_request`, `workflow_dispatch`.

**CD** (`templates/publish.yml`): on `v*.*.*` tag → determine version (strip leading `v`) →
restore → build → **test** → pack `-p:Version=$VER` → push. Gate publish behind tests.

**Trusted Publishing (OIDC) — the auth model:** no long-lived API key. The job needs
`permissions: id-token: write`; `NuGet/login@v1` exchanges the GitHub OIDC token for a
short-lived key:
```yaml
- uses: NuGet/login@v1
  id: login
  with: { user: ${{ vars.NUGET_USER }} }
- run: dotnet nuget push "artifacts/*.nupkg" --api-key "${{ steps.login.outputs.NUGET_API_KEY }}" --source https://api.nuget.org/v3/index.json --skip-duplicate
```
The NuGet.org Trusted Publishing **policy** must name owner, repo, and the **workflow
filename** (e.g. `publish.yml`). `NUGET_USER` is a repo **variable**, not a secret.

**Gotchas (learned the hard way):**
- **Version source is the git tag**, not the csproj — confirm the trigger model with the user.
- **`--skip-duplicate`** so a re-run never hard-fails on an already-pushed version.
- **Pin actions to Node-LTS-native majors** — verify latest (`gh api repos/actions/checkout/releases/latest`,
  `.../setup-dotnet/...`, `.../NuGet/login/...`); old majors emit Node-deprecation warnings.
- **LF in committed YAML.** With `* text=auto` the blob is LF even if Windows shows CRLF;
  confirm: `git show HEAD:.github/workflows/publish.yml | grep -c $'\r'` → `0` (CRLF in a
  bash `run:` step breaks on Linux runners).
- **Verify before trusting:** run the exact CI command sequence locally, and after push use
  `gh run watch <id> --exit-status` / `gh pr checks <pr>` rather than assuming green.

---

## Phase 6 — SonarCloud (static analysis)

**Default: CI-based analysis _with test coverage_** (`templates/sonar.yml`). Automatic Analysis
is the zero-config fallback for repos not worth wiring. The two modes are **mutually exclusive
per project** — a CI-based scan errors if Automatic Analysis is still on.

**CI-based + coverage — the default.**
- Drop in `templates/sonar.yml`: JDK + .NET setup, installs `dotnet-sonarscanner` +
  `dotnet-coverage`, then `begin` → `dotnet build` → `dotnet-coverage collect "dotnet test"`
  → `end`, feeding coverage via `sonar.cs.vscoveragexml.reportsPaths`. Checkout needs
  `fetch-depth: 0`.
- Fill `/k:<project-key>` `/o:<org-key>`. Read both from the public API:
  `curl -s "https://sonarcloud.io/api/components/show?component=<project-key>"` →
  `.component.organization` is the org key (project key is usually `<GitHubOrg>_<repo>`).
- **One-time org setup (not per-repo):** add a GitHub **organization** secret `SONAR_TOKEN`
  (one SonarCloud token shared by every repo → no per-repo secret), and **turn Automatic
  Analysis OFF** for the project (Administration > Analysis Method; the API's `autoscanEnabled`
  must become `false`) or the analyses conflict.
- Gives coverage **and** the deeper C# (MSBuild-integrated) rules.

**Automatic Analysis — zero-config fallback.**
- Server-side scan of default branch + PRs, no workflow/secret. Enable once at the org level
  (Import all repositories / auto-onboard new repos). **No coverage.**

**Per-repo step the skill always does: the badges.** Project key is `<org>_<repo>` (e.g.
`PFalkowski_LoggerLite`). Verify each resolves before adding — never ship a broken badge:
```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://sonarcloud.io/api/project_badges/measure?project=<org>_<repo>&metric=alert_status"  # expect 200
```
Add to the README badge block (it's also the nuget.org package page). With CI-based coverage,
add the coverage badge too:
```markdown
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=<org>_<repo>&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=<org>_<repo>)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=<org>_<repo>&metric=coverage)](https://sonarcloud.io/summary/new_code?id=<org>_<repo>)
```

## Phase 7 — Security & quality checklist

- [ ] No long-lived secrets in CI/CD (Trusted Publishing/OIDC for NuGet).
- [ ] Least privilege: explicit job `permissions:` (`contents: read` + only what's needed; `id-token: write` only on the publish job).
- [ ] No EOL target frameworks or EOL/abandoned dependencies; no known-vulnerable pins (`dotnet list package --vulnerable --include-transitive`).
- [ ] Deterministic, restore-then-build pipeline; tests gate every publish.
- [ ] Don't pull a heavy dependency for one helper — prefer BCL or a focused implementation.
- [ ] Package metadata complete: license expression, README, repo URL, symbols/docs.

---

## Phase 8 — Ship & verify

- Push branch; open PR with a structured body (group findings; what + why). Use `gh pr create`.
- Confirm CI green **on the PR** (`gh pr checks <n>`).
- **Outward-facing actions are the user's call** — offer to merge/tag/publish; don't auto-run.
- After release: `gh run view <id>` to confirm the CD run, then confirm the index picked it up:
  `curl -s https://api.nuget.org/v3-flatcontainer/<id-lowercase>/index.json` (allow a few
  minutes of indexing lag — a successful push step is the source of truth).
