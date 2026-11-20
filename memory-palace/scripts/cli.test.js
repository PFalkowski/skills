'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PalaceError, parseJson, describe } = require('./lib/errors.js');
const { cli, envFor, hashes } = require('./test-support.js');

const SETTINGS = { backend: 'folder', passphrase: null, kinds: ['decision', 'fact'], moments: ['on-request', 'end-of-task'] };
const MEMORY = { place: 'wing/room/drawer', title: 'A title', summary: 'A summary', text: 'The full text.', kind: 'fact' };
const MARKER = 'MKPLcli7Qz4wx';

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cli-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, env: envFor(root) };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function setUp(t, name = 'palace') {
  const box = sandbox(t);
  const dir = path.join(box.root, name);
  ok(await cli(box.env, ['setup', '--palace', dir], SETTINGS));
  return { ...box, dir };
}

test('cli: status with no machine record prints {"palace": null} and a proposal', async (t) => {
  const { env } = sandbox(t);
  const status = ok(await cli(env, ['status', '--scope', 'global']));
  assert.strictEqual(status.palace, null);
  assert.strictEqual(status.proposed.scope, 'global');
});

test('cli: setup then status prints kinds and moments', async (t) => {
  const { env, dir } = await setUp(t);
  const status = ok(await cli(env, ['status', '--scope', 'global']));
  assert.strictEqual(status.palace, dir);
  assert.strictEqual(status.backend, 'folder');
  assert.strictEqual(status.protected, false);
  assert.strictEqual(status.online, false);
  assert.deepStrictEqual(status.kinds, SETTINGS.kinds);
  assert.deepStrictEqual(status.moments, SETTINGS.moments);
});

test('cli: a new process with the same HOME finds the palace', async (t) => {
  const { env } = await setUp(t);
  ok(await cli(env, ['save'], MEMORY));
  const recalled = ok(await cli(env, ['recall'], { place: MEMORY.place }));
  assert.strictEqual(recalled.found, true);
  assert.strictEqual(recalled.text, MEMORY.text);
});

test('cli: setup makes the palace the default; --palace opens another', async (t) => {
  const { root, env, dir: first } = await setUp(t, 'first');
  const second = path.join(root, 'second');
  ok(await cli(env, ['setup', '--palace', second], SETTINGS));
  assert.strictEqual(ok(await cli(env, ['status', '--scope', 'global'])).palace, second);
  ok(await cli(env, ['save'], MEMORY));
  assert.strictEqual(ok(await cli(env, ['recall', '--palace', second], { place: MEMORY.place })).found, true);
  assert.deepStrictEqual(ok(await cli(env, ['recall', '--palace', first], { place: MEMORY.place })), { found: false });
  ok(await cli(env, ['save', '--palace', first], { ...MEMORY, place: 'only/first' }));
  assert.strictEqual(ok(await cli(env, ['recall', '--palace', first], { place: 'only/first' })).found, true);
  assert.deepStrictEqual(ok(await cli(env, ['recall'], { place: 'only/first' })), { found: false });
});

test('cli: save then recall; an absent place gives found false', async (t) => {
  const { env } = await setUp(t);
  ok(await cli(env, ['save'], MEMORY));
  const recalled = ok(await cli(env, ['recall'], { place: MEMORY.place }));
  assert.strictEqual(recalled.found, true);
  for (const field of Object.keys(MEMORY)) assert.strictEqual(recalled[field], MEMORY[field], field);
  assert.ok(!Number.isNaN(Date.parse(recalled.saved)), `saved ${recalled.saved}`);
  assert.deepStrictEqual(ok(await cli(env, ['recall'], { place: 'wing/absent' })), { found: false });
});

test('cli: invalid place refused, nothing written', async (t) => {
  const { env, dir } = await setUp(t);
  ok(await cli(env, ['save'], MEMORY));
  const before = hashes(dir);
  for (const [place, rule] of [['a//b', /empty segment/], ['a/../b', /\. or \.\./], ['/a', /start or end with \//]]) {
    const result = await cli(env, ['save'], { ...MEMORY, place });
    assert.strictEqual(result.code, 1, `${place}: ${result.stderr}`);
    assert.match(result.stderr, rule);
    assert.deepStrictEqual(hashes(dir), before, place);
  }
});

test('cli: field over its limit refused, nothing written', async (t) => {
  const { env, dir } = await setUp(t);
  ok(await cli(env, ['save'], MEMORY));
  const before = hashes(dir);
  for (const [field, rule] of [[{ title: 't'.repeat(121) }, /title.*120/], [{ text: 'x'.repeat(32001) }, /text.*32,?000/]]) {
    const result = await cli(env, ['save'], { ...MEMORY, ...field });
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, rule);
    assert.deepStrictEqual(hashes(dir), before);
  }
});

test('cli: --passphrase and --password rejected', async (t) => {
  const { env } = sandbox(t);
  const secret = 'MKPLsecret9Rt2x';
  for (const args of [['status', '--passphrase', secret], ['save', '--password', secret], ['setup', `--passphrase=${secret}`]]) {
    const result = await cli(env, args);
    assert.strictEqual(result.code, 2, `${args.join(' ')}: ${result.stderr}`);
    assert.match(result.stderr, /\benv\b/);
    assert.match(result.stderr, /\bfile\b/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret), 'the passphrase was echoed');
  }
});

test('cli: a content field on argv is a usage error', async (t) => {
  const { env } = sandbox(t);
  for (const flag of ['--title', '--place', '--summary', '--text', '--kind']) {
    const result = await cli(env, ['save', flag, 'x']);
    assert.strictEqual(result.code, 2, `${flag}: ${result.stderr}`);
  }
});

test('cli: malformed stdin with a marker', async (t) => {
  const { env } = await setUp(t);
  for (const input of [`{"place": "${MARKER}"`, `["${MARKER}"]`, `"${MARKER}"`, `{"place": "${MARKER}"} {}`]) {
    const result = await cli(env, ['save'], input);
    assert.strictEqual(result.code, 2, `${input}: ${result.stderr}`);
    assert.match(result.stderr, /standard input is not one valid JSON object/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(MARKER), `marker echoed for ${input}`);
  }
});

const SESSION_FALLBACK = 'path.join(os.tmpdir(), `memory-palace-${user}`)';

test('cli: K5 source scan', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(__dirname);
  assert.ok(files.length > 5, `only ${files.length} files found`);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [, argument] of source.matchAll(/\brequire\s*\(([^)]*)\)/g)) {
      assert.match(argument, /^\s*['"](node:|\.\/|\.\.\/)/, `${path.relative(__dirname, file)} requires ${argument}`);
    }
    if (!file.endsWith('.test.js')) assert.doesNotMatch(source.replace(SESSION_FALLBACK, ''), /\b(tmpdir|mkdtemp)/, `${path.relative(__dirname, file)} makes temp files`);
  }
});

test('cli: unlock is a known command', async (t) => {
  const { env } = await setUp(t);
  assert.deepStrictEqual(ok(await cli(env, ['unlock'])), { removed: null });
});

test('setup writes the gitignore', async (t) => {
  const { dir } = await setUp(t);
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').trimEnd().split('\n'), ['lock', '*.tmp', 'pending.*']);
  assert.ok(!fs.existsSync(path.join(dir, 'lock')), 'setup left a lock file');
});

test('setup refuses a non-empty target', async (t) => {
  const { root, env } = sandbox(t);
  const dir = path.join(root, 'taken');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
  const before = hashes(dir);
  const siblings = fs.readdirSync(root);
  const result = await cli(env, ['setup', '--palace', dir], SETTINGS);
  assert.strictEqual(result.code, 1, result.stderr);
  assert.deepStrictEqual(hashes(dir), before);
  assert.deepStrictEqual(fs.readdirSync(root), siblings);
  assert.strictEqual(ok(await cli(env, ['status', '--scope', 'global'])).palace, null);
});

test('errors: parseJson gives a fixed message and never echoes the input', () => {
  assert.deepStrictEqual(parseJson('{"a": [1]}', 'the lock record'), { a: [1] });
  for (const text of [`{"place": "${MARKER}"`, `${MARKER}`, '']) {
    assert.throws(
      () => parseJson(text, 'the lock record'),
      (err) => err instanceof PalaceError && err.message === 'the lock record is not valid JSON',
      text,
    );
  }
});

test('errors: describe prints only name, code, syscall and path of an error the skill did not raise', () => {
  assert.strictEqual(describe(new PalaceError(`busy: ${MARKER}`)), `busy: ${MARKER}`);
  const io = Object.assign(new Error(`open failed for ${MARKER}`), { code: 'EACCES', syscall: 'open', path: '/srv/palace/meta' });
  assert.strictEqual(describe(io), 'internal error: Error EACCES open /srv/palace/meta');
  const bug = new TypeError(`cannot read ${MARKER}`);
  assert.strictEqual(describe(bug), 'internal error: TypeError');
  assert.ok(!describe(bug).includes(' at '), 'describe printed a stack');
});

const SQLITE_COMMANDS = [
  ['status'], ['unlock'], ['save', MEMORY], ['recall', { place: MEMORY.place }], ['browse', {}], ['list', {}],
  ['forget', { place: MEMORY.place }], ['sync'], ['check'], ['remote', { url: 'https://example.invalid/palace.git' }], ['join', { passphrase: null }],
];

test('358-1: every command refuses a v1 SQLite palace and changes nothing', async (t) => {
  const { root, env } = sandbox(t);
  const dir = path.join(root, 'v1-sqlite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'palace.json'), `${JSON.stringify({ ...SETTINGS, format: 1, backend: 'sqlite', protected: false, kdf: null, check: null, tree: { m: 128, L: 32 }, privateRemote: null })}\n`);
  fs.writeFileSync(path.join(dir, 'palace.db'), 'v1 database bytes');
  const before = hashes(dir);
  for (const [command, input] of SQLITE_COMMANDS) {
    const result = await cli(env, [command, '--palace', dir], input ?? '');
    assert.strictEqual(result.code, 1, `${command}: ${result.stdout}${result.stderr}`);
    assert.ok(result.stderr.startsWith(`${dir} is a SQLite palace, which this version no longer reads.`), `${command}: ${result.stderr}`);
    assert.match(result.stderr, /git -C skills-v1 checkout f7a6691/, command);
    assert.deepStrictEqual(hashes(dir), before, command);
  }
  assert.ok(!fs.existsSync(path.join(env.XDG_CONFIG_HOME, 'memory-palace')), 'a command wrote the machine record');
});

test('358-2: setup with the sqlite backend is a usage error', async (t) => {
  const { root, env } = sandbox(t);
  const dir = path.join(root, 'palace');
  const result = await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'sqlite' });
  assert.strictEqual(result.code, 2, result.stderr);
  assert.match(result.stderr, /v2 has only the folder backend/);
  assert.ok(!fs.existsSync(dir), 'setup made the folder');
});

test('358-3: no file of the skill names the SQLite module', () => {
  const needle = ['node', 'sqlite'].join(':');
  const skill = path.dirname(__dirname);
  const files = [...function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else yield full;
    }
  }(skill)];
  assert.ok(files.length > 10, `only ${files.length} files found`);
  assert.deepStrictEqual(files.filter((file) => fs.readFileSync(file, 'utf8').includes(needle)).map((file) => path.relative(skill, file)), []);
});

test('358-4: a SQLite default stops a bare status with the global prefix, and setup {} takes the default over', async (t) => {
  const { root, env } = sandbox(t);
  const dir = path.join(root, 'v1-sqlite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'palace.json'), `${JSON.stringify({ ...SETTINGS, format: 1, backend: 'sqlite', protected: false, kdf: null, check: null, tree: { m: 128, L: 32 }, privateRemote: null })}\n`);
  const record = path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, JSON.stringify({ default: dir, palaces: { [dir]: { passphrase: null, protected: false } } }));
  const result = await cli(env, ['status']);
  assert.strictEqual(result.code, 1, result.stdout);
  assert.ok(result.stderr.startsWith(`global palace: ${dir} is a SQLite palace, which this version no longer reads.`), result.stderr);
  const { palace } = ok(await cli(env, ['setup'], { passphrase: null }));
  const machine = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.strictEqual(machine.default, palace);
  assert.deepStrictEqual(machine.palaces[dir], { passphrase: null, protected: false });
});
