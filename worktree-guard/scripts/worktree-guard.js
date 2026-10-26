// PreToolUse(Bash|PowerShell) guard: `git worktree add` must target <repo>/.claude/worktrees/<slug>,
// the folder EnterWorktree uses, so one global ignore rule covers every repository.
const ADD = /\bgit(?:\.exe)?(?:\s+-[cC]\s+\S+)*\s+worktree\s+add\b([^;&|\n]*)/g;
const INSIDE = /\.claude[\\/]worktrees[\\/]/;

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let command;
  try { command = JSON.parse(raw).tool_input?.command ?? ''; } catch { return; }
  if ([...command.matchAll(ADD)].every(([, args]) => INSIDE.test(args))) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Worktrees live under <repo-root>/.claude/worktrees/<slug>, not beside the repository or in a temp folder. ' +
        'Use EnterWorktree, or `git worktree add <repo-root>/.claude/worktrees/<slug> -b <branch> origin/main`. ' +
        'If this text is prose rather than a command, pass it through a file instead.',
    },
  }));
});
