---
name: formal-check
description: 'Model-check a race or check every input to a bound: choose, build or re-sync one check per promise.'
license: MIT
metadata:
  author: Lauren Tan (pstack), adapted by Piotr Falkowski
  copyright: "© 2026 Lauren Tan; adaptation © 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
  upstream: https://github.com/cursor/plugins/tree/34b1b7c96f09f81a21a6c78f65b7833f7dcb5b24/pstack/skills
---

# Formal check

A test checks the cases someone thought to write. A formal check covers every case in a stated
scope: every order of steps in a small model, or every input up to a bound.

## Terms

- **Promise**: a guarantee the code makes whose break harms a user. State the promise and the harm
  in one plain sentence each. This is not the manager's ledger tag of the same name.
- **Check**: the one command that tests a promise.
- **Broken variant**: a scratch change to the real code that breaks the promise, such as a removed
  check or a reordered step. It is made in a scratch copy, never in the working tree.
- **Project skill**: the skill CREATE leaves in the target repo, so the next agent can run the
  check and keep it true.
- **Coverage record**: the files and functions a check covers.
- **Sync commit**: the last commit at which the check was rerun and confirmed to describe the
  covered code.

## Three uses

The caller names one.

- **CHOOSE**, at plan time: classify one promise with the table below and name its check, or say
  why example tests reach it. Everything CHOOSE needs is in this file.
- **CREATE**: build one check for one promise, show it able to fail, and leave a project skill.
  Read [CREATE.md](CREATE.md) before building a check.
- **MAINTAIN**: bring checks back in line after the code changed. Read [MAINTAIN.md](MAINTAIN.md)
  before re-syncing checks.

## CHOOSE

| The promise asks | Check, in order of preference | Runs against |
|---|---|---|
| Can steps happen in a bad order? (races, retries, leases, check-then-act, a crash between two writes) | A design that makes the bad order impossible: one atomic operation, named by path:line or plan step; example tests then reach it. Else a model checker over a small model, TLA+ and its checker TLC by default. Read [TLC.md](TLC.md) before writing or running a TLA+ model. | A model whose every action cites path:line |
| Does it hold for every input? (parsers, redactors, encoders, cache keys) | Bounded exhaustive enumeration of a small input grammar; else a property-test library. Read [EVERY-INPUT.md](EVERY-INPUT.md) before writing an every-input check. Every run prints its bound or its seed. | The real code, never a hand model |
| Must it hold at every size, where a bound is not enough? | A proof. formal-check builds none: it says so, builds the strongest bounded check with its bound stated, and records the proof as an open item. | — |
| None of these | Say why example tests reach it. | — |

Pick the strongest promise, the one whose break harms users most and that tests rarely reach, not
the one that is easiest to check.

## Seven guards

Every check keeps all seven.

1. **True to the code.** Every part of a model or check points at code a reviewer can open. One
   indivisible step in the code is one step in the check.
2. **Able to fail.** Each property is shown failing on a broken variant of the real code. A check
   never seen to fail proves nothing.
3. **Findings stay findings.** A failing property is reported with its counterexample in the
   code's terms. Never weaken the property or the model to make it pass. Never change product
   code unless asked.
4. **Honest about scope.** State the bounds, the assumptions and what is left out. A pass covers
   the model or the bound, nothing more.
5. **Readable without the tool.** The property and the harm in one plain sentence each. A
   counterexample as a short list of steps in the code's words.
6. **Cheap to rerun.** One command, a pinned tool version, and a run short enough to repeat on
   every relevant change.
7. **Kept in step.** The coverage record and the sync commit are written down, and the sync
   commit moves only after the check is rerun against the new code.

## Worked example

[LeaseRace.tla](LeaseRace.tla) and [LeaseAtomic.tla](LeaseAtomic.tla), with their config files,
show how to run TLC and read a failure: two workers take one lease. LeaseRace checks and takes in
two steps and breaks the invariant; LeaseAtomic does both in one step and passes. They have no
code under them. A real check cites path:line on every action.

## State

Inside the target repo, formal-check writes the project skill, the check's own files (a model sits
in the project skill's folder; an every-input harness sits with the repo's tests), and any
test-only dependency, named in the handoff. Outside it, it writes two things and nothing else,
both in the system temp folder: scratch copies of the code, where a check is shown able to fail
([CREATE.md](CREATE.md) step 4), and TLC work folders ([TLC.md](TLC.md) says what they hold).

## Attribution

Adapted from two pstack skills in cursor/plugins (MIT). [NOTICE.md](NOTICE.md) lists what changed
and carries the upstream licence.
