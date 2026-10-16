---
name: systematic-debugging
description: 'Find the root cause of a bug, test failure or unexpected behaviour before proposing any fix.'
license: MIT
metadata:
  author: Jesse Vincent (superpowers), adapted by Piotr Falkowski
  copyright: "© 2025 Jesse Vincent; adaptation © 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
  upstream: https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/systematic-debugging
---

# Systematic debugging

**No fix without a root cause.** Until phase 1 is done, do not propose a fix. A fix that removes a
symptom without explaining it is a failure, however green the tests look.

Use it for any bug, failing test, build or integration failure, performance problem or surprise,
and most of all when a quick fix looks obvious, time is short, or a fix has already failed.

Project-specific skills, such as one that logs in to reproduce as a signed-in user, are tools
inside this process, not replacements for it.

## Phase 1: Root cause

1. **Read the error completely:** the whole stack trace, every warning, line numbers, codes.
2. **Reproduce it reliably,** with exact steps. If it will not reproduce, gather more data; do not
   guess.
3. **Check what changed:** the diff, recent commits, dependencies, config, environment.
4. **Across components, instrument every boundary before theorising.** Log what enters and leaves
   each one (CI → build → deploy, API → service → database), run once, and let the evidence say
   which boundary breaks. Then investigate only that component.
5. **Trace a bad value backwards** to where it originates, and fix it there.
   Read [references/root-cause-tracing.md](references/root-cause-tracing.md) when the failure
   surfaces deep in a call stack, or when something appears during a test run and you do not know
   which test caused it.

## Phase 2: Pattern

1. Find similar code that works, in the same codebase.
2. If you are following a reference implementation, read all of it, not a skim.
3. List every difference between working and broken, however small. Do not decide in advance
   that one "cannot matter".
4. Name the dependencies: other components, settings, environment, assumptions.

## Phase 3: Hypothesis

1. **One hypothesis, written down:** "X is the root cause because Y."
2. **Test it with the smallest change,** one variable at a time.
3. **Confirmed?** Go to phase 4. **Refuted?** Form a new hypothesis; never stack another fix on top.
4. **If you do not understand something, say so.** Research, or ask; do not pretend.

When a claim can be settled by an experiment or a source, the [fact-check](../fact-check/SKILL.md)
skill sets the standard of evidence.

## Phase 4: Fix

1. **Write a failing test first:** the smallest reproduction, automated if the project allows,
   a one-off script if not.
2. **Make one change** that addresses the root cause. No "while I'm here" improvements, no bundled
   refactoring.
3. **Verify before claiming success:** the new test passes, no other test broke, and the original
   symptom is gone where it was reported, not only in the test.
4. **If the fix fails, stop and count.** After one or two failed fixes, return to phase 1 with what
   you learned.
5. **After three failed fixes, stop fixing.** When each fix reveals a new problem somewhere else,
   needs a large refactor, or creates new symptoms, the design is wrong, not the hypothesis. Raise
   the architecture with the user before a fourth attempt.

Read [references/defense-in-depth.md](references/defense-in-depth.md) once the root cause is fixed
and the same bad value could arrive through other paths.
Read [references/condition-based-waiting.md](references/condition-based-waiting.md) when a test is
flaky, races, or relies on a fixed sleep or timeout.

## Stop and return to phase 1 when

- You are about to "try X and see", or change several things and rerun.
- You think "quick fix now, investigate later", or "it's probably X".
- You are listing fixes without having traced the data flow.
- You want to skip the failing test and check by hand.
- You are adapting a pattern you have not read in full.
- You are about to attempt one more fix after two have failed.
- The user asks "is that actually happening?", "stop guessing", or "are we stuck?". Each of these
  means you assumed something you did not verify.

## When there is no root cause

If the investigation shows the cause really is external, environmental or timing-dependent: record
what you checked, handle it explicitly (retry, timeout, clear error message), and add logging so the
next occurrence leaves evidence. Most "no root cause" conclusions are an investigation that stopped
too early, so be sure before you settle on this one.

## Attribution

Adapted from the `systematic-debugging` skill in [obra/superpowers](https://github.com/obra/superpowers)
by Jesse Vincent, under the MIT License. See [NOTICE.md](NOTICE.md) for the licence text and what
changed.
