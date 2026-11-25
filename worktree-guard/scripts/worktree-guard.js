// PreToolUse(Bash|PowerShell) guard: `git worktree add` must target <repo>/.claude/worktrees/<slug>,
// the folder EnterWorktree uses, so one global ignore rule covers every repository.
// `git worktree remove` must not take the folder the session was launched in, or one holding it:
// the transcript is filed under that folder's name, so the session could no longer be resumed.
const path = require('node:path');

const ADD = /\bgit(?:\.exe)?(?:\s+-[cC]\s+\S+)*\s+worktree\s+add\b([^;&|\n]*)/g;
const REMOVE = /\bgit(?:\.exe)?((?:\s+-[cC]\s+\S+)*)\s+worktree\s+remove\b([^;&|<>)\n]*)/g;
const INSIDE = /\.claude[\\/]worktrees[\\/]/;
const WORKTREES = '-claude-worktrees-';
const projectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const unquote = (s) => s.replace(/^["']|["']$/g, '');

const deny = (reason) => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
}));

const removesLaunchFolder = (command, cwd, transcriptPath) => {
  if (typeof cwd !== 'string' || typeof transcriptPath !== 'string') return false;
  const launchKey = projectKey(path.basename(path.dirname(transcriptPath)));
  return [...command.matchAll(REMOVE)].some(([, globals, args]) => {
    const dir = [...globals.matchAll(/-C\s+(\S+)/g)].map(([, d]) => unquote(d));
    const target = args.replace(/\s\d+$/, '').trim().split(/\s+/).filter((a) => a && !a.startsWith('-')).pop();
    if (!target) return false;
    const parts = [...dir, unquote(target)];
    const key = projectKey(path.resolve(cwd, ...parts));
    return (!parts.some(path.isAbsolute) && launchKey.endsWith(projectKey(path.join('/', parts.at(-1), '.')))) ||
      launchKey === key || launchKey.startsWith(`${key}-${WORKTREES}`) ||
      (key.endsWith(WORKTREES.slice(0, -1)) && launchKey.startsWith(`${key}-`));
  });
};

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let command, removesLaunch;
  try {
    const input = JSON.parse(raw);
    command = String(input?.tool_input?.command ?? '');
    removesLaunch = removesLaunchFolder(command, input.cwd, input.transcript_path);
  } catch { return; }
  if (![...command.matchAll(ADD)].every(([, args]) => INSIDE.test(args))) {
    return deny(
      'Worktrees live under <repo-root>/.claude/worktrees/<slug>, not beside the repository or in a temp folder. ' +
      'Use EnterWorktree, or `git worktree add <repo-root>/.claude/worktrees/<slug> -b <branch> origin/main`. ' +
      'If this text is prose rather than a command, pass it through a file instead.');
  }
  if (removesLaunch) {
    deny(
      'This session was launched in that worktree, and its transcript is filed under that folder: removing it ' +
      'leaves the session impossible to resume or message. Leave the worktree for the next session\'s wrap-up sweep. ' +
      'If the target is a different folder, write out its absolute path, with no `~` or variable.');
  }
});
