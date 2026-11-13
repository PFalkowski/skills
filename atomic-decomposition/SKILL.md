---
name: atomic-decomposition
description: 'Split an important claim too big or vague to check at once into checkable atoms.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# atomic-decomposition

Divide a claim until one check can settle each piece, then settle the pieces. Favour neither verdict: a check counts only if it could come out either way.

Use it when an important claim is too large or too vague to check in one step. Skip it when one check already settles the claim. Restate anything that is not a claim as the claim it makes: a plan claims that its steps reach the goal, a decision that the chosen option beats the others, a review finding that the code has a specific defect.

## Build the tree

1. **Make the root testable.** Replace vague words with concrete values: "the import is slow" becomes "the import runs one query per row". Rewrite a claim that no observation could show true or false.
2. **Split it into the claims it needs.** Mark a parent `all` when it needs every child. Mark it `any` when it can hold in more than one way, with one branch per way.
3. **Check every split before its pieces.** When a decision that is hard to undo depends on the claim, an agent that did not write the split checks it.
   - *Enough* (`all`): if every child held, could the parent still be false? Add the missing child.
   - *Needed* (`all`): could this child be false while the parent holds? Weaken the child to what the parent needs.
   - *Sufficient* (`any`): could this branch hold while the parent is false? Strengthen the branch.
   - *Every way* (`any`): show that the branches cover every way the parent can hold, or add a branch "it holds some other way", which stays unsettled until it can be checked.
4. **Stop at atoms.** An atom is a claim that one method settles in one step another person can repeat, where that step could come out either way. Keep splitting while a piece needs two methods or two steps. A piece that can be neither split nor checked is still an atom: keep it and mark it unsettled.
5. **Write each atom as one plain sentence**, after ASD-STE100 Simplified Technical English:
   - One statement. An "and", "or" or "because" shows the atom can still be split.
   - One name per thing and one meaning per word, across the tree.
   - Active voice with a named actor, present tense, exact values with units. No "should", "properly" or "fast".
   - The rewritten atom says exactly what the original said.

## Settle the atoms

6. **Go to the source**, the thing the claim is about. Run the program for what it does. Quote the source code for what the code says or contains. Quote the original document for what it says. For a fact with no single source, use the sources [fact-check](../fact-check/SKILL.md) requires. Ask the person who owns a decision only what cannot be looked up. A summary, a comment, a document about the code or memory is a lead, never evidence.
7. **Confirm and refute on the same basis.** A run, a quoted source, or two independent authoritative sources settle an atom either way. Weaker evidence leaves it unsettled. The author's judgement never settles it. When a decision that is hard to undo depends on the claim, a fresh agent carries out the check.
8. **State the expected answer before checking.** Then design the check to find the truth, not to reach that answer or to defeat it.
9. **Work one atom at a time, in dependency order.** Among ready atoms, check first the one whose result, either way, fixes the most verdicts above it, then the cheapest.
10. **Attach the evidence**: the command and its real output, the quoted lines, or the links.

## Carry verdicts up

- An `all` parent is **refuted** if any child is refuted, **confirmed** if every child is confirmed, and **unsettled** otherwise.
- An `any` parent is **confirmed** if any branch is confirmed, **refuted** if every branch is refuted, and **unsettled** otherwise.
- One refuted child fixes an `all` parent, and one confirmed branch fixes an `any` parent. Stop checking under a fixed parent: each child left over, and everything beneath it, is **not checked**, names the atom that decided the parent, and counts toward no verdict. An unsettled child fixes nothing; keep checking its siblings.
- A settled claim keeps its verdict. A narrower or wider claim is a new root: propose it and decompose it separately.

## Report

Report the whole tree: each atom with its verdict, method and evidence, and each unsettled atom with what would settle it (the command, the test, or the person). Then answer the root claim exactly as it was first asked. Report confirmed atoms even when the root is unsettled. The skill that asked decides what to do about a verdict.

## Example

Root, an `all` parent: "After removing `retry()`, every request that succeeded before still succeeds."
- A1 "No file outside `client.js` calls `retry()`": `git grep` shows none. Confirmed.
- A2 "The HTTP library retries each failure that `retry()` retried": a script sends a POST to a local server that returns 503 once, and the server sees one attempt. Refuted.
- A3 "The tests still pass": not checked, because A2 refuted the root.

The root is refuted. Proposed new root: the same claim for GET requests only.

Draws on [grill-me](https://github.com/mattpocock/skills), [fact-check](../fact-check/SKILL.md) and [code-review-grill](../code-review-grill/SKILL.md).
