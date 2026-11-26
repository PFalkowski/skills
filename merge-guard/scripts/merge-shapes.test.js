const test = require('node:test');
const assert = require('node:assert');
const { reason } = require('./merge-guard.js');

const LINES_BEFORE = ['', 'SHA=`git rev-parse HEAD`\n', 'cd C:\\src\\\n'];
const EXECUTABLES = ['gh', 'gh.exe'];
const REPO_FLAGS = ['-R o/r', '--repo o/r', '--repo=o/r', '--repo="o/r"', '-R=o/r', '-Ro/r'];
const REPO_SLOTS = ['before pr', 'before merge', 'before the PR', 'after the PR'];
const GAPS = [' ', '  ', '\t', ' \\\n  ', ' `\n  ', ' `\r\n  '];
const OPTIONS = ['', '--squash', '--subject "fix 7"', '--match-head-commit a1b2c3d'];
const PULL_REQUESTS = ['42', 'https://github.com/o/r/pull/42'];
const TAILS = ['', '--delete-branch'];

function* shapes() {
  const placements = [{}, ...REPO_SLOTS.flatMap((slot) => REPO_FLAGS.map((flag) => ({ [slot]: flag })))];
  for (const before of LINES_BEFORE) for (const executable of EXECUTABLES) for (const placement of placements) for (const gap of GAPS)
    for (const option of OPTIONS) for (const pullRequest of PULL_REQUESTS) for (const tail of TAILS) {
      const words = [executable, placement['before pr'], 'pr', placement['before merge'], 'merge', option,
        placement['before the PR'], pullRequest, placement['after the PR'], tail].filter(Boolean);
      const repo = Object.keys(placement).length ? 'o/r' : undefined;
      yield { command: before + words.join(gap), expected: [{ number: pullRequest, repo }] };
    }
}

test('every shape of gh pr merge is checked against the PR and repo it names', () => {
  let count = 0, longest = 0;
  const missed = [];
  for (const { command, expected } of shapes()) {
    count++;
    longest = Math.max(longest, command.length);
    const calls = [];
    const denied = reason(command, (number, repo) => {
      calls.push({ number, repo });
      return { headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', comments: [], reviews: [] };
    });
    try {
      assert.deepStrictEqual(calls, expected);
      assert.match(denied ?? '', /no "Reviewed at <sha>" summary/);
    } catch {
      missed.push(JSON.stringify(command));
    }
  }
  console.log(`bound: ${count} commands, the longest ${longest} characters`);
  assert.strictEqual(missed.length, 0, `${missed.length} of ${count} commands were not checked, the first: ${missed[0]}`);
});

test('a PR number split by a continuation is not read as its first half', () => {
  for (const mark of ['\\', '`']) {
    const calls = [];
    reason(`gh pr merge 4${mark}\n2`, (number) => { calls.push(number); throw new Error('no such PR'); });
    assert.deepStrictEqual(calls, [`4${mark}`]);
  }
});
