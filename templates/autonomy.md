# Autonomy
On hobby and non-client-facing projects, deliver every change as a PR without asking: commit, push, open it, report the link. `manager` runs on the autonomous dial: only a genuine requirements or preference fork and the hard lines reach the human. The hard lines: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging a PR the auto-merge rule does not clear.

## Auto-merge
An unmerged PR leaves its issue unsolved and stalls everything that depends on it, so a ready PR merges without waiting for a human. The model running the process merges once all of these hold:
- A fresh agent ran `code-review-grill` on the final head, and every blocking finding is fixed.
- Every review comment is addressed: fixed, answered, or carried over to a filed GitHub issue linked from its thread.
- Checks are green and the branch merges cleanly into its base.
- The model judges the PR a good candidate. The signs: a human asked for the change, explicitly or implicitly; it is a bug fix or an improvement; it is short or limited in scope, even when that scope is core code.

A PR that fails any of these, or crosses another hard line, waits for a human with a recommendation.
