# Autonomy
On hobby and non-client-facing projects, deliver every change as a PR without asking: commit, push, open it, report the link. `manager` runs on the autonomous dial: only a genuine requirements or preference fork and the hard lines reach the human. The hard lines: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging a PR the auto-merge rule does not clear.

## Auto-merge
An unmerged PR leaves its issue unsolved and stalls everything that depends on it, so a ready PR merges without waiting for a human. The model running the process merges once all of these hold:
- A fresh agent ran `code-review-grill` on the final head and found nothing blocking. Fixes pushed after a review count only once a re-review of their delta passes; `merge-guard` refuses `gh pr merge` until the newest `Reviewed at <sha>` summary names the head.
- Every review comment is addressed: fixed, answered, or carried over to a filed GitHub issue linked from its thread.
- Checks are green and the branch merges cleanly into its base.
- The model judges the PR a good candidate. The signs: a human asked for the change, explicitly or implicitly; it is a bug fix or an improvement; it is short or limited in scope, even when that scope is core code.

A PR that fails any of these, or crosses another hard line, waits for a human with a recommendation.

## The autonomy flag
`CLAUDE_AUTONOMY` decides how the process skills run: `sdlc-old-fashioned`, `go-go-go`, `manager`, `code-review-grill`, `fix-pr` and `wrap-up`. Read it once at the start (`echo $CLAUDE_AUTONOMY`); never ask the human instead.
- Set it in the env block of `~/.claude/settings.json` for the machine, or in a repo's `.claude/settings.local.json` to override that repo. Unset, or any value but "autonomous", means attended. It applies only where this file does; a client repo runs attended unless the repo itself sets it.
- `CLAUDE_AUTONOMY=autonomous`: no questions mid-run, and the PR is driven to its end. `code-review-grill`, then `fix-pr` in auto mode (replies posted, carried tickets filed, threads resolved), then a re-review of the delta. Repeat until nothing blocks, with no cap on rounds: when re-reviews keep raising new findings, the review is too sensitive, so raise its bar (`code-review-grill`'s § The bar) via `evolve-skill` rather than stopping or handing the PR over. Then merge under the auto-merge rule, remove the run's worktree and the merged local branch, and run `wrap-up`.
- Before the first step, check that the commands the run needs will run without a prompt: `gh pr merge`, `gh pr comment`, `gh issue create`, `git worktree remove`, `git branch -d`. An ask rule in user settings beats any project allow, so a skill cannot grant itself one. Where a command would prompt, that step stops at "ready" with a recommendation, and the opening report says so.
- Attended: each skill's own gates and questions apply.
