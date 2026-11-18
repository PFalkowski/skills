# MAINTAIN: bring checks back in line with the code

Read this before re-syncing checks. Terms and the seven guards are in [SKILL.md](SKILL.md).

A check proves a property of what it describes. When the code changes and the check does not, the
check can keep passing while it describes code that no longer exists. That pass is the dangerous
case, because it looks like proof. MAINTAIN handles the changes that skipped the project skill:
merges, edits made without it, and drift across many commits.

## Outcomes

Give each check one outcome:

- **in sync**: nothing since the sync commit changes what the check describes, and it passes;
- **updated**: the code changed, the check now describes the new code, and it passes;
- **bug**: the check describes the current code, and the code breaks the property;
- **blocked**: the check could not be brought back in line or could not run. Say exactly why.

A check can be both updated and bug: the update makes it describe the code again, and then the
property fails.

## Edit scope

Edit only verification files: models, harnesses, property files and the project skill. Never edit
product code unless asked. Never weaken a property or a model to make it pass.

## The pass

1. **Find the checks.** Search the folders that hold project skills:

   ```bash
   git grep -n -E '^Sync commit: ' -- .claude/skills .agents/skills
   ```

   No output means no check was found this way. Then look for checks by what they do: a
   project skill that runs a model checker or a property test against named code. If none exists,
   stop and point to CREATE ([CREATE.md](CREATE.md)). For each check, collect the property, the
   covered code, the bounds and assumptions, the command and the sync commit
   ([git-grep](https://git-scm.com/docs/git-grep): `-n` line numbers, `-E` extended regular
   expressions).
2. **Check the sync commit.** Run `git merge-base --is-ancestor <sync> HEAD`. Exit 0 means it is
   an ancestor of HEAD. On any other exit (1 when it is not an ancestor; another code, such as 128,
   on an error like an unknown commit after a squash merge), fall back to the last commit that
   changed the verification files, `git log -1 --format=%H -- <files>`, and say so in the report. A
   sync commit of `none` takes the same fallback
   ([git-merge-base](https://git-scm.com/docs/git-merge-base),
   [git-log](https://git-scm.com/docs/git-log)).
3. **Run each check as it is,** before changing anything, and record the result. A pass says only
   that the old description still holds. A failure can be drift or a bug; do not decide which yet.
4. **Read every change to covered code** since the sync commit, with each commit message. Include
   code that moved or was renamed or split, and new code that writes the guarded state. Classify
   each change:
   - **no effect**: it changes nothing the check describes. Judge this against the model or
     harness, not the commit message;
   - **the check no longer describes the code**: a step that was one action is now two, a branch
     was added or removed, a new path reaches the guarded state, or a value's range changed;
   - **the promise changed on purpose**, with evidence in the change: a doc comment, a test, a
     changelog entry or the commit message;
   - **the promise may be broken**: the code changed and nothing says the promise did. A failure
     that follows is a bug candidate.
5. **Update from the code, not from the result.** Write the update before rerunning, and never
   shape it by what makes the check pass. Each changed part again cites code a reviewer can open.
   Change a property only for a promise that changed on purpose, and record the old wording, the
   new wording and the evidence. Keep the bounds, or say which one was reduced and why.
6. **Rerun.**
   - On a pass, show the updated check can still fail: repeat CREATE step 4 with its own new run
     folder, breaking the new code the way the property guards against.
   - On a failure, replay the counterexample against the code, step by step. A step the code
     cannot take means the verification is wrong: fix it and say what was wrong. Otherwise it is a
     bug: name the commit that introduced it, tell the steps in the code's words, and state the
     harm in one sentence. A cheap reproduction on the real code may go in the report; it is not
     committed to product code.
7. **Record the outcome.** Move the sync commit to the commit you checked, under CREATE's
   clean-tree test (CREATE step 7). Never move a blocked check's sync commit. Then follow the
   project skill once, as the next agent would, so you know its steps still run.

## Report

For each check: the outcome and the commits read; what changed in the verification and why; the
rerun result and the break that showed the check can still fail; each bug in plain words, with its
harm and the commit that introduced it; and what the check still does not cover. Say which failures
were drift and which were bugs. For a check that passed before the update and fails after, say the
old pass was on a stale description.

Put verification updates in a change of their own, separate from any product fix. For the status
checks behind the clean-tree test, see [git-status](https://git-scm.com/docs/git-status).
