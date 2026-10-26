const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const hook = path.join(__dirname, 'worktree-guard.js');
const decide = (command) => {
  const out = execFileSync('node', [hook], { input: JSON.stringify({ tool_input: { command } }) }).toString();
  return out ? JSON.parse(out).hookSpecificOutput.permissionDecision : 'allow';
};

for (const command of [
  'git worktree add ../skills-feature -b feature',
  'git -C /c/src/repo worktree add /tmp/wt-1 origin/main',
  'git.exe -c core.longpaths=true worktree add C:\\Temp\\wt main',
  'git status; git worktree add ../x',
  'cd repo && git worktree add "$TMP/salvage" -b salvage',
  'git worktree add ../x/.claude/worktrees-old/y',
]) test(`denies ${command}`, () => assert.strictEqual(decide(command), 'deny'));

for (const command of [
  'git worktree add .claude/worktrees/feature -b feature origin/main',
  'git -C C:/src/repo worktree add C:/src/repo/.claude/worktrees/x main',
  'git worktree add "C:\\src\\repo\\.claude\\worktrees\\x" -b x',
  'git worktree add -b x .claude/worktrees/x origin/main; git worktree list',
  'git worktree list',
  'git worktree remove ../skills-old',
  'echo hello',
]) test(`allows ${command}`, () => assert.strictEqual(decide(command), 'allow'));

test('allows input that is not JSON', () => {
  assert.strictEqual(execFileSync('node', [hook], { input: 'not json' }).toString(), '');
});
