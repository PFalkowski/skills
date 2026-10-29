# Cloud sessions: what changes when Claude Code runs in the cloud

A cloud session is Claude Code running in a short-lived container instead of on your machine. It sets `CLAUDE_CODE_REMOTE=true` ([env vars](https://code.claude.com/docs/en/env-vars): "Set automatically to `true` when Claude Code is running as a cloud session"). Skills that assume a persistent local machine follow these rules when that variable is set. Each skill links here at the step that changes, rather than repeating the rules.

## Branches

The session's instructions name the branch to push to. Push there, and create another branch only where those instructions allow it; a repository attached later in the session may allow new branches when the session's own repository does not. Where a skill would stack branches, push to another PR's branch, or force-push, and the instructions do not allow it, put the work on the session's branch in one PR, or stop at "ready" with a recommendation.

## GitHub access

GraphQL is blocked, so `gh` commands built on it fail with `HTTP 403: GitHub GraphQL is not available from Claude Code sessions`. In testing this hit `gh pr list`, `gh pr checks`, `gh pr view --json reviews,comments`, `gh issue list`, `gh issue view` and `gh repo view`; expect other `gh pr` and `gh issue` subcommands to do the same. Use instead:

- `gh api` with REST routes, for example `gh api repos/{owner}/{repo}/pulls/{n}/comments`.
- The routes the 403 message names for review threads, thread resolution, auto-merge and draft state, for example `gh api repos/{owner}/{repo}/pulls/{n}/ccr/review_threads`.
- The GitHub MCP tools (`mcp__github__*`) when the session has them.

Never send stderr to `/dev/null` on a check whose empty result decides what happens next. A hidden 403 looks like "no PR yet" and leads to a duplicate.

## Nothing local survives

The container is deleted when the session ends: the home folder, `~/.agent-state/`, stashes, worktrees and uncommitted files go with it. A worktree adds no isolation, because no other session shares the clone. What must outlive the session is committed to the session's branch or posted on the PR or an issue, which is the [Publication rule](agent-state.md#publication-not-survival-makes-a-record-durable) applied early. State that must carry over between sessions, such as a watermark or a ledger, goes in a tracker issue; on a public repository, in a private one.

## No local machine

There is no terminal or PowerShell to open, no OS scheduler, and no local GPU, and a standing loop ends with the session. Start a fresh session through the harness, passing the handoff as its prompt, and schedule recurring work with the harness's scheduled tasks. A file meant for the user goes where the session's instructions say the user can open it, usually the working directory.
