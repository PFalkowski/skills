---
name: runbook
description: 'Write a committed runbook and guide the user through a procedure, including account or hardware steps.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# runbook

For guided procedures beyond assistant tools, the committed project file is the source of truth; chat points to it.

1. State scope in one line and prerequisites with cheap verification commands.
2. Verify every external price, console flow, flag, and URL; record sources and date instead of relying on memory.
3. Implement, test, and commit enabling code first; reference its commit. The procedure must not assume nonexistent code.
4. Write `docs/runbooks/<kebab-case-slug>.md`, creating the directory. Label each step **You** or **Assistant**; every You step says exactly what to report. Name command shells and use `<placeholders>` for supplied values.
5. **Commit before walking through it.** In chat, link the file and give only the next You step/report-back requirement.
6. On each report, execute unblocked Assistant steps and return the next You step.
7. Immediately update and recommit corrections to prices, flags, credits, or procedure.
8. Confirm the action that stops costs/exposure, then append date, result, cost, and corrections to Outcomes.

Use one file per procedure and start repeat runs from it, not memory. Keep chat brief; a longer walkthrough suggests the file is incomplete.

## Template

```md
# Runbook: <procedure>

**Purpose.** <what this achieves and excludes>
Written <date>; sources: <links>.

## Prerequisites
- <thing> — check: `<command>`

## 1. <step> — **You**; report back <exactly what>
<commands, shell, placeholders>

## 2. <step> — **Assistant**, once <condition>
<commands>

## N. Stop the meter — **You**; report back <confirmation>
<actually stop cost/exposure: destroy rather than power off, revoke, close>

## What this measures and what it does not

## Outcomes
- <date>: <result, cost, corrections>
```
