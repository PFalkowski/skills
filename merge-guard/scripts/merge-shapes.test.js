const test = require('node:test');
const assert = require('node:assert');
const { reason } = require('./merge-guard.js');

const LINES_BEFORE = ['', 'SHA=`git rev-parse HEAD`\n', 'cd C:\\src\\\n', 'x=1 \\\n'];
const EXECUTABLES = ['gh', 'gh.exe'];
const REPO_FLAGS = ['-R o/r', '--repo o/r', '--repo=o/r', '--repo="o/r"', '-R=o/r', '-Ro/r'];
const REPO_SLOTS = ['before pr', 'before merge', 'before the PR', 'after the PR'];
const PLAIN_GAPS = [' ', '  ', '\t'];
const SPLIT_GAPS = [' \\\n  ', ' `\n  ', ' `\r\n  '];
const GAPS = [...[...PLAIN_GAPS, ...SPLIT_GAPS].map((gap) => [gap, gap]), ...SPLIT_GAPS.flatMap((gap) => [[' ', gap], [gap, ' ']])];
const OPTIONS = ['', '--squash', '--subject "fix 7"', '--match-head-commit a1b2c3d'];
const PULL_REQUESTS = ['42', 'https://github.com/o/r/pull/42'];
const TAILS = ['', '--delete-branch'];

function* shapes() {
  const placements = [{}, ...REPO_SLOTS.flatMap((slot) => REPO_FLAGS.map((flag) => ({ [slot]: flag })))];
  for (const before of LINES_BEFORE) for (const executable of EXECUTABLES) for (const placement of placements)
    for (const [upToMerge, afterMerge] of GAPS) for (const option of OPTIONS) for (const pullRequest of PULL_REQUESTS) for (const tail of TAILS) {
      const head = [executable, placement['before pr'], 'pr', placement['before merge'], 'merge'].filter(Boolean).join(upToMerge);
      const rest = [option, placement['before the PR'], pullRequest, placement['after the PR'], tail].filter(Boolean);
      const repo = Object.keys(placement).length ? 'o/r' : undefined;
      yield { command: before + [head, ...rest].join(afterMerge), split: SPLIT_GAPS.includes(upToMerge) || SPLIT_GAPS.includes(afterMerge), lookup: { number: pullRequest, repo } };
    }
}

test('every shape of gh pr merge is looked up by the PR and repo it names, or refused when split over lines', () => {
  let count = 0, longest = 0;
  const missed = [];
  for (const { command, split, lookup } of shapes()) {
    count++;
    longest = Math.max(longest, command.length);
    const calls = [];
    const denied = reason(command, (number, repo) => {
      calls.push({ number, repo });
      return { headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', comments: [], reviews: [] };
    });
    try {
      assert.deepStrictEqual(calls, split ? [] : [lookup]);
      assert.match(denied ?? '', split ? /on one line/ : /no "Reviewed at <sha>" summary/);
    } catch {
      missed.push(JSON.stringify(command));
    }
  }
  console.log(`bound: ${count} commands, the longest ${longest} characters`);
  assert.strictEqual(missed.length, 0, `${missed.length} of ${count} commands were not checked, the first: ${missed[0]}`);
});

const reviewed = () => ({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', comments: [{ body: 'Reviewed at a1b2c3d', createdAt: '2026-10-27T10:00:00Z' }], reviews: [] });

test('a PR number split by a continuation is not read as its first half', () => {
  for (const mark of ['\\', '`']) {
    const calls = [];
    const denied = reason(`gh pr merge 4${mark}\n2`, (number) => { calls.push(number); return number === '4' ? reviewed() : assert.fail('no such PR'); });
    assert.ok(denied && !calls.includes('4'), `looked up ${calls}`);
  }
});

const FIRST_MERGES = ['gh pr merge 42', 'gh -R o/r pr merge 42', 'gh pr -R o/r merge 42', 'gh pr merge -R o/r 42'];
const BETWEEN = [' ', '; ', ' && ', ' | ', '\n', ' \\\n', ' # note \\\n', ' `\n', ' $(', ' (', ' `'];

test('a second merge is refused wherever it stands after a first one that was reviewed', () => {
  const onlyTheFirst = (number) => (number === '42' ? reviewed() : { ...reviewed(), comments: [] });
  const commands = FIRST_MERGES.flatMap((first) => BETWEEN.map((between) => `${first}${between}gh pr merge 43`));
  const allowed = commands.filter((command) => !reason(command, onlyTheFirst));
  console.log(`bound: ${commands.length} pairs of commands`);
  assert.deepStrictEqual(allowed, []);
});
