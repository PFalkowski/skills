const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const hook = path.join(__dirname, 'worktree-guard.js');
const decide = (command, extra = {}) => {
  const out = execFileSync('node', [hook], { input: JSON.stringify({ tool_input: { command }, ...extra }) }).toString();
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

const launchedIn = (dir) => ({
  cwd: '/src/repo',
  transcript_path: `/home/u/.claude/projects/${dir.replace(/[^a-zA-Z0-9]/g, '-')}/s.jsonl`,
});
const launched = launchedIn('/src/repo/.claude/worktrees/feature');

for (const command of [
  'git -C /src/repo worktree remove /src/repo/.claude/worktrees/feature',
  'git worktree remove .claude/worktrees/feature',
  'git worktree remove --force "/src/repo/.claude/worktrees/feature/"',
  'git -C /src/repo worktree remove .claude/worktrees',
]) test(`denies removing the launch worktree: ${command}`, () => assert.strictEqual(decide(command, launched), 'deny'));

for (const command of [
  'git -C /src/repo worktree remove /src/repo/.claude/worktrees/other',
  'git worktree remove .claude/worktrees/feat',
  'git worktree remove .claude/worktrees/feature-two',
]) test(`allows removing another worktree: ${command}`, () => assert.strictEqual(decide(command, launched), 'allow'));

test('allows removal when launched in the main checkout', () =>
  assert.strictEqual(decide('git worktree remove .claude/worktrees/feature', launchedIn('/src/repo')), 'allow'));

test('allows input that is not JSON', () => {
  assert.strictEqual(execFileSync('node', [hook], { input: 'not json' }).toString(), '');
});
