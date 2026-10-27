const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { reason } = require('./merge-guard.js');

const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const OLD = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c';
const comment = (body, createdAt = '2026-10-27T10:00:00Z') => ({ body, createdAt });
const pr = ({ comments = [], reviews = [] } = {}) => {
  const calls = [];
  const view = (number, repo) => {
    calls.push({ number, repo });
    return { headRefOid: HEAD, comments, reviews };
  };
  return { view, calls };
};

test('ignores commands that do not merge a PR', () => {
  const { view, calls } = pr();
  for (const command of ['gh pr view 25', 'gh pr list', 'git merge origin/main', 'echo hello']) {
    assert.strictEqual(reason(command, view), null);
  }
  assert.strictEqual(calls.length, 0);
});

test('allows a merge when a summary names the head', () => {
  const { view } = pr({ comments: [comment(`Reviewed at ${HEAD}\n\nNothing blocks.`)] });
  assert.strictEqual(reason('gh pr merge 42 --squash', view), null);
});

test('allows a short sha and a summary posted as a review', () => {
  const { view } = pr({ reviews: [{ body: 'Reviewed at a1b2c3d\n\nok', submittedAt: '2026-10-27T10:00:00Z' }] });
  assert.strictEqual(reason('gh pr merge 42 --merge', view), null);
});

test('denies a merge whose head moved after the last review', () => {
  const { view } = pr({ comments: [comment(`Reviewed at ${OLD}`)] });
  const why = reason('gh pr merge 42 --merge --delete-branch', view);
  assert.match(why, /0f1e2d3/);
  assert.match(why, /a1b2c3d/);
  assert.match(why, /0f1e2d3\.\.a1b2c3d/);
});

test('names the newest review in the delta, not an older one', () => {
  const { view } = pr({
    comments: [comment('Reviewed at 1111111', '2026-10-27T09:00:00Z')],
    reviews: [{ body: `Reviewed at ${OLD}`, submittedAt: '2026-10-27T11:00:00Z' }],
  });
  assert.match(reason('gh pr merge 42', view), /0f1e2d3\.\.a1b2c3d/);
});

test('denies a merge with no review summary', () => {
  const { view } = pr({ comments: [comment('LGTM'), comment('see "Reviewed at" above')] });
  assert.match(reason('gh pr merge 42', view), /no "Reviewed at <sha>" summary/);
});

test('denies a merge that does not name its PR', () => {
  const { view, calls } = pr();
  assert.match(reason('gh pr merge --squash --repo o/r', view), /name the PR/);
  assert.strictEqual(calls.length, 0);
});

test('denies when the PR cannot be read', () => {
  const view = () => { throw new Error('HTTP 404'); };
  assert.match(reason('gh pr merge 42', view), /HTTP 404/);
});

test('reads the PR and repo from the merge command, wherever it sits', () => {
  const { view, calls } = pr({ comments: [comment(`Reviewed at ${HEAD}`)] });
  reason('Set-Location C:\\src\\x; gh pr merge 42 --repo owner/name --merge 2>&1 | Select-Object -Last 3', view);
  reason('gh.exe pr merge --subject "fix 7" -R=other/repo https://github.com/o/r/pull/9', view);
  reason("gh pr merge --body 'a b' --repo=o/r 12 && gh pr view 12", view);
  assert.deepStrictEqual(calls, [
    { number: '42', repo: 'owner/name' },
    { number: 'https://github.com/o/r/pull/9', repo: 'other/repo' },
    { number: '12', repo: 'o/r' },
  ]);
});

test('the hook allows input that is not JSON', () => {
  const hook = path.join(__dirname, 'merge-guard.js');
  assert.strictEqual(execFileSync('node', [hook], { input: 'not json' }).toString(), '');
});

test('the hook stays silent for a command that merges nothing', () => {
  const hook = path.join(__dirname, 'merge-guard.js');
  const input = JSON.stringify({ tool_input: { command: 'git status' } });
  assert.strictEqual(execFileSync('node', [hook], { input }).toString(), '');
});
