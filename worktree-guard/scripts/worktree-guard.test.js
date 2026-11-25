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
  'git worktree remove /src/repo',
  'git worktree remove .claude/worktrees/feature 2>&1',
  'git worktree remove /SRC/Repo/.claude/worktrees/feature > out.txt',
]) test(`denies removing the launch worktree: ${command}`, () => assert.strictEqual(decide(command, launched), 'deny'));

for (const command of [
  'git -C /src/repo worktree remove /src/repo/.claude/worktrees/other',
  'git worktree remove .claude/worktrees/feat',
  'git worktree remove .claude/worktrees/feature-two',
]) test(`allows removing another worktree: ${command}`, () => assert.strictEqual(decide(command, launched), 'allow'));

test('allows removal when launched in the main checkout', () =>
  assert.strictEqual(decide('git worktree remove .claude/worktrees/feature', launchedIn('/src/repo')), 'allow'));

test('allows removing a sibling whose name the launch folder extends', () =>
  assert.strictEqual(decide('git worktree remove .claude/worktrees/feature',
    launchedIn('/src/repo/.claude/worktrees/feature-two')), 'allow'));

const standingInLaunchFolder = { ...launched, cwd: '/src/repo/.claude/worktrees/feature' };

for (const command of [
  'cd /src/repo && git worktree remove .claude/worktrees/feature',
  'cd "$ROOT"; git worktree remove --force .claude/worktrees/feature/',
  'pushd ~/src/repo && git -C .claude worktree remove worktrees/feature',
]) test(`denies removing the launch worktree after a directory change: ${command}`, () =>
  assert.strictEqual(decide(command, standingInLaunchFolder), 'deny'));

for (const command of [
  'cd /src/repo && git worktree remove .claude/worktrees/other',
  'cd /src/repo && git worktree remove .claude/worktrees/feature-two',
  'cd /src/other && git worktree remove /src/other/.claude/worktrees/feature',
]) test(`allows removing another worktree after a directory change: ${command}`, () =>
  assert.strictEqual(decide(command, standingInLaunchFolder), 'allow'));

test('resolves against the working directory when the directory change comes after the removal', () =>
  assert.strictEqual(decide('git worktree remove feature; cd /src/repo',
    { ...launchedIn('/src/repo/.claude/worktrees/my-feature'), cwd: '/src/repo/.claude/worktrees' }), 'allow'));

for (const input of ['null', '{"cwd":5,"transcript_path":"/a/b/c.jsonl","tool_input":{"command":"git worktree remove x"}}'])
  test(`fails open silently on ${input}`, () => assert.strictEqual(execFileSync('node', [hook], { input }).toString(), ''));

test('allows input that is not JSON', () => {
  assert.strictEqual(execFileSync('node', [hook], { input: 'not json' }).toString(), '');
});
