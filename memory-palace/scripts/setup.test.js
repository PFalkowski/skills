'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { setup } = require('./lib/palace.js');
const { cli, envFor, hashes, scan } = require('./test-support.js');

const KINDS = ['decision', 'preference', 'fact', 'lesson'];
const MOMENTS = ['on-request', 'after-decision', 'end-of-task'];
const MEMORY = { place: 'wing/room', title: 'A title', summary: 'A summary', text: 'The full text.', kind: 'fact' };
const IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid'];
const posix = process.platform !== 'win32';

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-setup-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = envFor(root);
  return {
    root,
    env,
    keyFile: path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'key'),
    globalFolder: path.join(env.XDG_DATA_HOME, 'memory-palace', 'global'),
    record: path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json'),
  };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function failed(result, what) {
  assert.strictEqual(result.code, 1, `${what}: exit ${result.code}: ${result.stdout}${result.stderr}`);
  return result.stderr;
}

const git = (env, args) => execFileSync('git', [...IDENTITY, ...args], { env, timeout: 10000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const modeOf = (file) => fs.statSync(file).mode & 0o777;
const note = (file) => `This palace is encrypted with the key in ${file}. Back up that file now, somewhere private and off this machine, such as a password manager. Losing it loses every memory in this palace: nothing else can open it. To use this palace on another machine, copy the file there and give \`join\` its path.`;

async function savesAndRecalls(env, dir) {
  ok(await cli(env, ['save', '--palace', dir], MEMORY));
  assert.strictEqual(ok(await cli(env, ['recall', '--palace', dir], { place: MEMORY.place })).text, MEMORY.text, dir);
}

test('359-1: status with no palace proposes the defaults with absolute paths', async (t) => {
  const { env, keyFile, globalFolder } = sandbox(t);
  assert.deepStrictEqual(ok(await cli(env, ['status'])), {
    scopes: { global: null, project: null, session: null },
    projectRoot: env.HOME,
    proposed: { scope: 'global', palace: globalFolder, passphrase: { file: keyFile, create: true }, remote: null, kinds: KINDS, moments: MOMENTS },
    hook: 'absent',
  });
});

test('355-1: setup {} unprotected creates the global palace in the data folder and makes it the default', async (t) => {
  const { env, globalFolder, record } = sandbox(t);
  const result = ok(await cli(env, ['setup'], { passphrase: null }));
  assert.deepStrictEqual(result, { palace: globalFolder, scope: 'global', default: globalFolder });
  const machine = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.strictEqual(machine.default, globalFolder);
  assert.strictEqual(machine.palaces[globalFolder].passphrase, null);
  await savesAndRecalls(env, globalFolder);
});

test('359-2: setup {} creates the machine key file mode 600, protects the palace with it, and tells the user to back it up', async (t) => {
  const { env, keyFile, globalFolder, record } = sandbox(t);
  const result = ok(await cli(env, ['setup'], {}));
  assert.deepStrictEqual(result, { palace: globalFolder, scope: 'global', default: globalFolder, keyFile, note: note(keyFile) });
  if (posix) assert.strictEqual(modeOf(keyFile), 0o600);
  assert.match(fs.readFileSync(keyFile, 'utf8'), /^[A-Za-z0-9_-]{43}\n$/);
  const settings = JSON.parse(fs.readFileSync(path.join(globalFolder, 'palace.json'), 'utf8'));
  assert.strictEqual(settings.protected, true);
  assert.deepStrictEqual(settings.kinds, KINDS);
  assert.deepStrictEqual(settings.moments, MOMENTS);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(record, 'utf8')).palaces[globalFolder].passphrase, { file: keyFile });
  await savesAndRecalls(env, globalFolder);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(keyFile)).filter((name) => name.endsWith('.tmp')), []);
});

test('359-3: the key never appears in output, the machine record or the palace folder', async (t) => {
  const { root, env, keyFile, globalFolder } = sandbox(t);
  const results = [await cli(env, ['setup'], {})];
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  results.push(await cli(env, ['save'], MEMORY), await cli(env, ['status']), await cli(env, ['recall'], { place: MEMORY.place }));
  for (const result of results) {
    ok(result);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(key), 'a command printed the key');
  }
  fs.renameSync(keyFile, path.join(root, 'moved-key'));
  assert.deepStrictEqual(scan([env.XDG_CONFIG_HOME, globalFolder], [key]), []);
});

test('359-4: a second setup reuses the key file unchanged and repeats the note; both palaces open', async (t) => {
  const { root, env, keyFile, globalFolder } = sandbox(t);
  ok(await cli(env, ['setup'], {}));
  const bytes = fs.readFileSync(keyFile);
  const second = path.join(root, 'second');
  const result = ok(await cli(env, ['setup', '--palace', second], {}));
  assert.strictEqual(result.keyFile, keyFile);
  assert.strictEqual(result.note, note(keyFile));
  assert.deepStrictEqual(fs.readFileSync(keyFile), bytes);
  await savesAndRecalls(env, globalFolder);
  await savesAndRecalls(env, second);
});

test('359-4: an existing key file is proposed with create false and used as it is', async (t) => {
  const { env, keyFile, globalFolder } = sandbox(t);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, 'MKPL-a-key-the-user-already-had\n', { mode: 0o600 });
  assert.deepStrictEqual(ok(await cli(env, ['status'])).proposed.passphrase, { file: keyFile, create: false });
  assert.strictEqual(ok(await cli(env, ['setup'], {})).note, note(keyFile));
  assert.strictEqual(fs.readFileSync(keyFile, 'utf8'), 'MKPL-a-key-the-user-already-had\n');
  await savesAndRecalls(env, globalFolder);
});

test('359-5: a machine key file open to other users is refused and nothing is written', { skip: !posix && 'POSIX modes' }, async (t) => {
  const { env, keyFile, globalFolder, record } = sandbox(t);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, 'MKPL-open-key\n');
  fs.chmodSync(keyFile, 0o644);
  assert.match(failed(await cli(env, ['setup'], {}), 'open key'), /the key file .* is open to other users/);
  assert.ok(!fs.existsSync(globalFolder), 'setup made the palace');
  assert.ok(!fs.existsSync(record), 'setup wrote the machine record');
  assert.strictEqual(fs.readFileSync(keyFile, 'utf8'), 'MKPL-open-key\n');
});

test('359-6: a key file that appears between the check and the create is used, never overwritten', async (t) => {
  const { env, keyFile, globalFolder } = sandbox(t);
  const winner = 'MKPL-the-other-setup-won\n';
  const result = setup(undefined, {}, { env, beforeKeyLink: () => fs.writeFileSync(keyFile, winner, { mode: 0o600 }) });
  assert.strictEqual(result.keyFile, keyFile);
  assert.strictEqual(fs.readFileSync(keyFile, 'utf8'), winner);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(keyFile)).filter((name) => name !== 'key' && name !== 'config.json'), []);
  await savesAndRecalls(env, globalFolder);
});

test('359-7: setup refuses to create the key file inside a git repository that does not ignore it, and writes nothing', async (t) => {
  const { root, env: base } = sandbox(t);
  const dotfiles = path.join(root, 'dotfiles');
  git(base, ['init', '-q', dotfiles]);
  const env = { ...base, XDG_CONFIG_HOME: path.join(dotfiles, 'config') };
  const keyFile = path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'key');
  const before = hashes(root);
  const stderr = failed(await cli(env, ['setup'], {}), 'key in a repository');
  assert.strictEqual(stderr.trim(), `${keyFile} is inside the git repository ${dotfiles} and is not ignored there, so that repository's commits would take the key. Ignore it there, or pass a passphrase source. Nothing was written.`);
  assert.deepStrictEqual(hashes(root), before);
  assert.ok(!fs.existsSync(env.XDG_CONFIG_HOME), 'setup made the configuration folder');
  assert.ok(!fs.existsSync(env.XDG_DATA_HOME), 'setup made the data folder');
  fs.writeFileSync(path.join(dotfiles, '.gitignore'), 'config/memory-palace/\n');
  ok(await cli(env, ['setup'], {}));
});

test('a refused setup leaves no key file behind', async (t) => {
  const { root, env, keyFile } = sandbox(t);
  const taken = path.join(root, 'taken');
  fs.mkdirSync(taken);
  fs.writeFileSync(path.join(taken, 'keep.txt'), 'keep');
  assert.match(failed(await cli(env, ['setup', '--palace', taken], {}), 'not empty'), /is not empty/);
  assert.match(failed(await cli(env, ['setup'], { remote: path.join(root, 'no-such-remote') }), 'unreachable remote'), /does not appear to be a git repository/);
  assert.ok(!fs.existsSync(keyFile), 'a refused setup created the key file');
});

test('359-8: setup with only changed fields defaults the rest and has no key file or note', async (t) => {
  const { env, keyFile, globalFolder } = sandbox(t);
  const result = ok(await cli(env, ['setup'], { remote: null, passphrase: null }));
  assert.deepStrictEqual(result, { palace: globalFolder, scope: 'global', default: globalFolder });
  const settings = JSON.parse(fs.readFileSync(path.join(globalFolder, 'palace.json'), 'utf8'));
  assert.strictEqual(settings.protected, false);
  assert.deepStrictEqual(settings.kinds, KINDS);
  assert.deepStrictEqual(settings.moments, MOMENTS);
  assert.ok(!fs.existsSync(keyFile), 'setup made a key file for an unprotected palace');
});

test('359-9: missing parents of the default folders are created mode 700; palace folders are 700 after setup and join', { skip: !posix && 'POSIX modes' }, async (t) => {
  const umask = process.umask(0o022);
  t.after(() => process.umask(umask));
  const { root, env: base } = sandbox(t);
  const env = { ...base, XDG_CONFIG_HOME: path.join(root, 'fresh', 'config'), XDG_DATA_HOME: path.join(root, 'fresh', 'data'), GIT_ALLOW_PROTOCOL: 'file' };
  ok(await cli(env, ['setup'], {}));
  const made = [env.XDG_CONFIG_HOME, path.join(env.XDG_CONFIG_HOME, 'memory-palace'), env.XDG_DATA_HOME, path.join(env.XDG_DATA_HOME, 'memory-palace'), path.join(env.XDG_DATA_HOME, 'memory-palace', 'global')];
  assert.deepStrictEqual(made.map(modeOf), made.map(() => 0o700), made.join(' '));

  const remote = path.join(root, 'remote.git');
  git(env, ['init', '-q', '--bare', '-b', 'main', remote]);
  const shared = path.join(root, 'shared');
  ok(await cli(env, ['setup', '--palace', shared], { passphrase: null, remote, private: true }));
  assert.strictEqual(modeOf(shared), 0o700);
  const joined = path.join(root, 'joined');
  ok(await cli(env, ['join', '--palace', joined], { passphrase: null, remote }));
  assert.strictEqual(modeOf(joined), 0o700);

  const stderr = failed(await cli(env, ['setup', '--palace', path.join(root, 'absent', 'palace')], {}), 'missing parent');
  assert.match(stderr, /the parent folder .*absent does not exist/);
});

test('359-10: join with a key file that does not open the palace says wrong passphrase and changes nothing', async (t) => {
  const { env, keyFile, globalFolder } = sandbox(t);
  ok(await cli(env, ['setup'], {}));
  const other = sandbox(t);
  fs.mkdirSync(path.dirname(other.keyFile), { recursive: true });
  fs.writeFileSync(other.keyFile, 'MKPL-a-different-key\n', { mode: 0o600 });
  const keys = [fs.readFileSync(keyFile), fs.readFileSync(other.keyFile)];
  const before = hashes(globalFolder);
  const joining = (input) => cli(other.env, ['join', '--palace', globalFolder], input);
  assert.match(failed(await joining({ passphrase: { file: other.keyFile } }), 'other key'), /^wrong passphrase/);
  assert.match(failed(await joining({}), 'no passphrase source'), /^passphrase must be null/);
  assert.deepStrictEqual(hashes(globalFolder), before);
  assert.deepStrictEqual([fs.readFileSync(keyFile), fs.readFileSync(other.keyFile)], keys);
  assert.ok(!fs.existsSync(other.record), 'join wrote the machine record');
});
