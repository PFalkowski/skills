---
name: clean-room
description: 'Reimplement behavior without copying protected source, using isolated study/build passes and a screened brief.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# clean-room

Use when studying material you may not incorporate, you need its behavior/design rather than expression, and independent provenance must be demonstrable. Skip for your own/permissively usable code; for one borrowed idea or convention, declare the tier and attribution.

## Tiers — decide this before anything else

| Tier | Material | Action |
|---|---|---|
| A — Use it | Permissive dependency, public API/protocol consumed under its terms | Use and attribute normally; no clean room |
| B — Reimplement from published prose | Architecture, algorithms, methods, vocabulary, observable behavior in prose or external observation | Follow this skill |
| C — Re-derive from the primary source | Curated lists, catalogs, tables, datasets, coefficients | Use the upstream authority; compilations may carry database/selection rights |
| D — Needs a licence | Source files/snippets, assets, generated artifacts, config, fixtures, project names/logos | Stop; obtain rights or drop the feature. Clean-room process does not grant a license |

## The shape

**Blind preflight → separate study session → screened prose brief → fresh source-denied build → attribution.** The brief is the only study artifact that may reach builders or reviewers. Study may read/run the source but may never write into the clean repository.

## Procedure

### 0. Preflight — declare the goal *before* you look

Before opening the source, write in the run directory: externally observable goal; source, license, copyright holder, version/commit; tier; writable clean root; deny-list tokens (source package, distinctive identifiers, internal path prefixes). If the goal cannot be stated blind, ask the user before browsing.

### 1. Study pass — read widely, write prose

Use its own session. It may inspect source, product, docs, tests, and issues, but cannot create/edit anything under the clean root, including comments, stubs, and test names. Its only output is `<run>/brief.md`.

Describe inputs, outputs, ordering, units, errors, behavioral decisions and reasons, edge cases, acceptance criteria, and open questions. Exclude code, source-shaped pseudocode, file paths, identifiers, diffs, screenshots, UI strings, comments, and verbatim docs. An engineer unfamiliar with the source must be able to reproduce required behavior while choosing incidental implementation details independently. Cut doubtful details; a detailed paraphrase of construction is contamination.

### 2. Screen the brief — mechanically, then by judgement

```bash
node <skill-dir>/screen-brief.mjs --brief <run>/brief.md --deny-list <run>/deny-list.txt
```

The script flags fences, paths, diffs, deny-list hits, and suspicious identifiers; passing is necessary, not sufficient. Check reported line/token counts and, once per project, plant a violation to prove detection; empty input/deny lists or wrong files are not valid screens.

Then remove descriptions of construction, reconstructable layout/class/call-graph details, and passages unavailable through external observation. Record screen output + timestamp; unrecorded screening is insufficient.

### 3. Build pass — never look

Use a fresh session or subagent containing the brief, never study context. Builders may read the brief, primary sources, clean repo, and general references; never the restricted source, study transcript, or other study artifacts. They write all code/tests/docs. Reviewers are source-denied too.

For brief gaps, record the question and decide from first principles or commission a new study pass whose amendment goes through the same screen. Never peek.

### 4. Refocus — audit against the declared scope

At checkpoints and before merge, compare against the blind goal. Check for source-feature scope creep; distinctive matching names, structures, or constants; and clean-root content traceable directly to study. Change unexplained matches or document unavoidable primary-source/conventional ones.

### 5. Attribution and the record

Record project, author, license, URL, and precisely what was learned in `ATTRIBUTIONS.md`, `NOTICE`, or the decision record. Link the decision record to the run ledger. Never imply affiliation/endorsement or use source names/marks in product surfaces.

## Run ledger

Keep permanently **outside** the clean repository in a sibling location, never a subdirectory, submodule, or `node_modules`:

```
<runs>/clean-room/<yyyy-mm-dd>-<slug>/
  preflight.md      blind goal, source, license, tier, clean root
  deny-list.txt     excluded tokens
  brief.md          only artifact crossing to build
  screen.txt        output + timestamp
  gaps.md           build questions and resolutions
  attribution.md    clean repo's prior-art entry
```

## Modes

- **Attended (default):** user reviews preflight before study and brief before build.
- **Unattended:** only after approved preflight, with bounded iterations; build gaps pause for a new study pass. Never use unattended mode for the first encounter with a source.

## Composes with

Use `fact-check` for load-bearing license/formula/API claims before they enter the brief; `handoff` for study/build separation; source-denied `code-review-grill` briefed with the goal; `evolve-skill` to add discovered leak patterns to deny-list defaults and failure guidance.

*Prior art: two-role separation, blind preflight, leakage rules, and ledger informed by `clean-room-skill` (pi.dev/packages/clean-room-skill). Independent dependency-free implementation for Claude Code skills; no package code, CLI, hooks, or npm install.*
