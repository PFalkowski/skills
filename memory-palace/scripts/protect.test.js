'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { cli, envFor, hashes, scan } = require('./test-support.js');

const VAR = 'MP_TEST_PASSPHRASE';
const PASS = 'MKPLpass-fake-passphrase-0000';
const SETTINGS = { backend: 'folder', passphrase: null, kinds: ['note'], moments: ['on-request'] };
const PROTECTED = { ...SETTINGS, passphrase: { env: VAR }, kdf: { N: 2 ** 14 } };

const tag = () => `MKPL${crypto.randomBytes(6).toString('hex')}`;
const machineFile = (env) => path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function memoryOf(mark, place = `wing/${mark}P/room`) {
  return { place, title: `${mark}T`, summary: `${mark}S`, text: `${mark}X`, kind: 'note' };
}

const needlesOf = (memory) => [memory.place.split('/')[1], memory.title, memory.summary, memory.text];

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-protect-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gitConfig = path.join(root, 'gitconfig');
  fs.writeFileSync(gitConfig, '');
  const env = { ...envFor(root), GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1', [VAR]: PASS };
  return { root, env, dir: path.join(root, 'palace') };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function failed(result, what) {
  assert.strictEqual(result.code, 1, `${what}: exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return result.stderr;
}

async function protectedPalace(t, settings = PROTECTED) {
  const box = sandbox(t);
  ok(await cli(box.env, ['setup', '--palace', box.dir], settings));
  const memory = memoryOf(tag());
  ok(await cli(box.env, ['save'], memory));
  return { ...box, memory };
}

function everyOp(memory) {
  return [
    ['save', { ...memoryOf(tag()), place: 'other/place' }],
    ['recall', { place: memory.place }],
    ['browse', {}],
    ['list', {}],
    ['forget', { place: memory.place }],
    ['check', ''],
  ];
}

function pageFiles(dir) {
  const pages = path.join(dir, 'pages');
  return fs.readdirSync(pages).flatMap((sub) => fs.readdirSync(path.join(pages, sub)).map((id) => ({ id, file: path.join(pages, sub, id) })));
}

function noContent(result, memory) {
  for (const needle of needlesOf(memory)) assert.ok(!`${result.stdout}${result.stderr}`.includes(needle), `output holds ${needle}`);
}

async function rejectsDamage(env, memory, id, what) {
  const result = await cli(env, ['recall'], { place: memory.place });
  const stderr = failed(result, what);
  assert.match(stderr, /damaged or altered/, what);
  assert.ok(stderr.includes(id), `${what}: ${stderr} does not name ${id}`);
  assert.doesNotMatch(stderr, /passphrase/i, what);
  assert.strictEqual(result.stdout, '', what);
  noContent(result, memory);
}

function git(env, args) {
  return execFileSync('git', args, { env, timeout: 10000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function repoBox(t, ignore) {
  const box = sandbox(t);
  const repo = path.join(box.root, 'repo');
  git(box.env, ['init', '-q', repo]);
  if (ignore !== null) fs.writeFileSync(path.join(repo, '.gitignore'), ignore);
  return { ...box, repo, target: path.join(repo, 'palace') };
}

function nothingWritten(env, target) {
  assert.ok(!fs.existsSync(target), `${target} exists`);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(target)).filter((name) => name.includes('.setup-')), [], 'a setup temp sibling is left');
  assert.ok(!fs.existsSync(machineFile(env)), 'a machine record was written');
}

test('C1: wrong passphrase', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  const before = hashes(dir);
  const wrong = { ...env, [VAR]: 'MKPLwrong-fake-passphrase' };
  for (const [op, input] of everyOp(memory)) {
    const result = await cli(wrong, [op], input);
    assert.match(failed(result, op), /passphrase/i, op);
    noContent(result, memory);
  }
  assert.deepStrictEqual(hashes(dir), before);
});

test('C2: one flipped byte', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  for (const { id, file } of pageFiles(dir)) {
    const original = fs.readFileSync(file);
    const flipped = Buffer.from(original);
    flipped[Math.floor(flipped.length / 2)] ^= 1;
    fs.writeFileSync(file, flipped);
    await rejectsDamage(env, memory, id, `flipped ${id}`);
    fs.writeFileSync(file, original);
  }
  assert.strictEqual(ok(await cli(env, ['recall'], { place: memory.place })).text, memory.text);
});

test('C3: a page copied over another id', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  const pages = pageFiles(dir);
  assert.ok(pages.length >= 2, `only ${pages.length} pages`);
  for (const from of pages) {
    for (const to of pages.filter((page) => page !== from)) {
      const original = fs.readFileSync(to.file);
      fs.copyFileSync(from.file, to.file);
      await rejectsDamage(env, memory, to.id, `${from.id} over ${to.id}`);
      fs.writeFileSync(to.file, original);
    }
  }
});

test('C4: unencrypted node, and a restored old ciphertext', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  for (const { id, file } of pageFiles(dir)) {
    const original = fs.readFileSync(file);
    fs.writeFileSync(file, JSON.stringify({ t: 'l', k: [], v: [] }));
    await rejectsDamage(env, memory, id, `unencrypted ${id}`);
    fs.writeFileSync(file, original);
  }

  const snapshot = pageFiles(dir).map(({ file }) => [file, fs.readFileSync(file)]);
  const newer = memoryOf(tag(), memory.place);
  assert.strictEqual(ok(await cli(env, ['save'], newer)).replaced, true);
  for (const [file, bytes] of snapshot) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  for (const [op, field] of [['recall', 'text'], ['browse', 'summary']]) {
    const result = await cli(env, [op], op === 'recall' ? { place: memory.place } : {});
    for (const old of [memory.title, memory.summary, memory.text]) assert.ok(!result.stdout.includes(old), `${op} returned ${old}`);
    if (result.code !== 0) {
      assert.match(result.stderr, /damaged or altered/, op);
      continue;
    }
    const out = JSON.parse(result.stdout);
    assert.strictEqual(op === 'recall' ? out[field] : out.memories[0][field], newer[field], op);
  }
});

test('C5: a missing page', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  for (const { id, file } of pageFiles(dir)) {
    fs.renameSync(file, `${file}.away`);
    const result = await cli(env, ['recall'], { place: memory.place });
    const stderr = failed(result, `missing ${id}`);
    assert.match(stderr, /missing/);
    assert.ok(stderr.includes(id), `${stderr} does not name ${id}`);
    assert.doesNotMatch(stderr, /passphrase/i);
    assert.strictEqual(result.stdout, '');
    noContent(result, memory);
    fs.renameSync(`${file}.away`, file);
  }
});

test('F2/F5: key file inside the palace', async (t) => {
  const { root, env } = sandbox(t);
  const insideKey = (target) => {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'key'), `${PASS}\n`);
    return path.join(target, 'key');
  };

  const plain = path.join(root, 'plain');
  const keyLinked = path.join(root, 'key-linked');
  fs.symlinkSync(insideKey(keyLinked), path.join(root, 'key-link'));
  fs.mkdirSync(path.join(root, 'real'));
  const palaceLinked = path.join(root, 'real', 'palace');
  fs.symlinkSync(path.join(root, 'real'), path.join(root, 'real-link'));
  insideKey(palaceLinked);
  const cases = [
    [plain, insideKey(plain)],
    [keyLinked, path.join(root, 'key-link')],
    [path.join(root, 'real-link', 'palace'), path.join(root, 'real-link', 'palace', 'key')],
  ];
  for (const [target, file] of cases) {
    const before = hashes(root);
    const stderr = failed(await cli(env, ['setup', '--palace', target], { ...PROTECTED, passphrase: { file } }), `setup ${file}`);
    assert.match(stderr, /key file/i, file);
    assert.match(stderr, /inside/i, file);
    assert.deepStrictEqual(hashes(root), before, file);
    assert.ok(!fs.existsSync(machineFile(env)), 'a machine record was written');
  }

  const dir = path.join(root, 'palace');
  const outside = path.join(root, 'outside-key');
  fs.writeFileSync(outside, `${PASS}\n`);
  ok(await cli(env, ['setup', '--palace', dir], { ...PROTECTED, passphrase: { file: outside } }));
  const memory = memoryOf(tag());
  ok(await cli(env, ['save'], memory));
  fs.copyFileSync(outside, path.join(dir, 'key'));
  fs.symlinkSync(path.join(dir, 'key'), path.join(root, 'open-key-link'));
  fs.symlinkSync(dir, path.join(root, 'palace-link'));
  const opens = [
    [dir, path.join(dir, 'key')],
    [dir, path.join(root, 'open-key-link')],
    [path.join(root, 'palace-link'), path.join(root, 'palace-link', 'key')],
  ];
  for (const [palace, file] of opens) {
    const record = readJson(machineFile(env));
    record.palaces[dir].passphrase = { file };
    writeJson(machineFile(env), record);
    const result = await cli(env, ['recall', '--palace', palace], { place: memory.place });
    const stderr = failed(result, `open ${palace} with ${file}`);
    assert.match(stderr, /key file/i, file);
    assert.match(stderr, /inside/i, file);
    noContent(result, memory);
  }
});

test('F3: no passphrase available', async (t) => {
  const { root, env, dir, memory } = await protectedPalace(t);
  const before = hashes(dir);
  const withoutVar = { ...env };
  delete withoutVar[VAR];
  for (const [op, input] of everyOp(memory)) {
    const result = await cli(withoutVar, [op], input);
    assert.ok(failed(result, op).includes(VAR), `${op}: ${result.stderr} does not name ${VAR}`);
  }
  assert.deepStrictEqual(hashes(dir), before);

  const keyFile = path.join(root, 'absent-key');
  const record = readJson(machineFile(env));
  record.palaces[dir].passphrase = { file: keyFile };
  writeJson(machineFile(env), record);
  for (const [op, input] of everyOp(memory)) {
    const result = await cli(env, [op], input);
    assert.ok(failed(result, op).includes(keyFile), `${op}: ${result.stderr} does not name ${keyFile}`);
  }
  assert.deepStrictEqual(hashes(dir), before);
});

test('F4: trailing newline and empty passphrase', async (t) => {
  const { root, env, dir } = sandbox(t);
  const echoed = path.join(root, 'echoed-key');
  execFileSync('sh', ['-c', `echo "${PASS}" > "${echoed}"`], { timeout: 10000 });
  ok(await cli(env, ['setup', '--palace', dir], { ...PROTECTED, passphrase: { file: echoed } }));
  const memory = memoryOf(tag());
  ok(await cli(env, ['save'], memory));

  const crlf = path.join(root, 'crlf-key');
  fs.writeFileSync(crlf, `${PASS}\r\n`);
  for (const passphrase of [{ env: VAR }, { file: crlf }]) {
    const record = readJson(machineFile(env));
    record.palaces[dir].passphrase = passphrase;
    writeJson(machineFile(env), record);
    assert.strictEqual(ok(await cli(env, ['recall'], { place: memory.place })).text, memory.text, JSON.stringify(passphrase));
  }

  const blank = path.join(root, 'blank-key');
  fs.writeFileSync(blank, '\n');
  for (const [passphrase, childEnv] of [[{ env: VAR }, { ...env, [VAR]: '' }], [{ file: blank }, env]]) {
    const target = path.join(root, 'empty-pass');
    const stderr = failed(await cli(childEnv, ['setup', '--palace', target], { ...PROTECTED, passphrase }), JSON.stringify(passphrase));
    assert.match(stderr, /empty/i);
    assert.ok(!fs.existsSync(target), `${target} exists`);
  }
});

test('F6: protection pin', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  const settingsFile = path.join(dir, 'palace.json');
  writeJson(settingsFile, { ...readJson(settingsFile), protected: false, kdf: null, check: null });
  const before = hashes(dir);
  for (const [op, input] of everyOp(memory)) {
    const result = await cli(env, [op], input);
    const stderr = failed(result, op);
    assert.match(stderr, /protected/, op);
    assert.match(stderr, /palace\.json/, op);
    noContent(result, memory);
  }
  assert.deepStrictEqual(hashes(dir), before);
});

test('F6: a protected palace.json without a string check is refused by name', async (t) => {
  const { env, dir, memory } = await protectedPalace(t);
  const settingsFile = path.join(dir, 'palace.json');
  const { check, ...settings } = readJson(settingsFile);
  for (const broken of [settings, { ...settings, check: null }, { ...settings, check: 42 }]) {
    writeJson(settingsFile, broken);
    const before = hashes(dir);
    const what = `check ${JSON.stringify(broken.check)}`;
    const result = await cli(env, ['recall'], { place: memory.place });
    const stderr = failed(result, what);
    assert.match(stderr, /palace\.json/, what);
    assert.match(stderr, /check/, what);
    assert.doesNotMatch(stderr, /internal error/, what);
    noContent(result, memory);
    assert.deepStrictEqual(hashes(dir), before, what);
  }
  writeJson(settingsFile, { ...settings, check });
  assert.strictEqual(ok(await cli(env, ['recall'], { place: memory.place })).text, memory.text);
});

test('setup under a missing parent folder names it and writes nothing', async (t) => {
  const { root, env } = sandbox(t);
  const parent = path.join(root, 'missing');
  const before = hashes(root);
  const stderr = failed(await cli(env, ['setup', '--palace', path.join(parent, 'palace')], SETTINGS), 'missing parent');
  assert.ok(stderr.includes(parent), `${stderr} does not name ${parent}`);
  assert.doesNotMatch(stderr, /internal error/);
  assert.ok(!fs.existsSync(parent), `${parent} exists`);
  assert.deepStrictEqual(hashes(root), before);
  assert.ok(!fs.existsSync(machineFile(env)), 'a machine record was written');
});

test('KDF1: defaults and floor', async (t) => {
  const { env, dir, root } = sandbox(t);
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, passphrase: { env: VAR } }));
  assert.deepStrictEqual(
    (({ name, N, r, p }) => ({ name, N, r, p }))(readJson(path.join(dir, 'palace.json')).kdf),
    { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 },
  );
  const memory = memoryOf(tag());
  ok(await cli(env, ['save'], memory));
  assert.strictEqual(ok(await cli(env, ['recall'], { place: memory.place })).text, memory.text);

  const low = path.join(root, 'low');
  const stderr = failed(await cli(env, ['setup', '--palace', low], { ...PROTECTED, kdf: { N: 2 ** 13 } }), 'N = 2^13');
  assert.match(stderr, /\bN\b/);
  assert.match(stderr, /16384|2\^14/);
  assert.ok(!fs.existsSync(low), `${low} exists`);
});

async function fillPalace(env, dir, settings) {
  ok(await cli(env, ['setup', '--palace', dir], settings));
  const kept = memoryOf(tag());
  const replaced = memoryOf(tag());
  const forgotten = memoryOf(tag());
  for (const memory of [kept, replaced, forgotten]) ok(await cli(env, ['save'], memory));
  const replacement = memoryOf(tag(), replaced.place);
  assert.strictEqual(ok(await cli(env, ['save'], replacement)).replaced, true);
  assert.strictEqual(ok(await cli(env, ['forget'], { place: forgotten.place })).found, true);
  return {
    live: [...needlesOf(kept), ...needlesOf(replacement)],
    all: [kept, replaced, forgotten, replacement].flatMap(needlesOf),
  };
}

test('B1 folder offline', async (t) => {
  const { env, dir } = sandbox(t);
  const { all } = await fillPalace(env, dir, PROTECTED);
  assert.deepStrictEqual(scan([dir, env.HOME, env.TMPDIR], [...all, PASS]), []);
});

test('B2 folder offline', async (t) => {
  const { env, dir } = sandbox(t);
  const { live } = await fillPalace(env, dir, SETTINGS);
  for (const needle of live) assert.ok(scan([dir], [needle]).length > 0, `scan missed ${needle}`);
});

test('enclosing repo: unprotected setup refused', async (t) => {
  for (const ignore of [null, '*.json\n']) {
    const { env, repo, target } = repoBox(t, ignore);
    const stderr = failed(await cli(env, ['setup', '--palace', target], SETTINGS), `ignore ${ignore}`);
    assert.ok(stderr.includes(repo), `${stderr} does not name ${repo}`);
    assert.match(stderr, /ignore/i);
    assert.match(stderr, /outside/i);
    assert.match(stderr, /protection/i);
    nothingWritten(env, target);
  }
});

test('enclosing repo: ignored folder accepted', async (t) => {
  const { env, target } = repoBox(t, 'palace/\n');
  assert.strictEqual(ok(await cli(env, ['setup', '--palace', target], SETTINGS)).palace, target);
});

test('enclosing repo: protected setup warns', async (t) => {
  const { env, repo, target } = repoBox(t, null);
  const result = await cli(env, ['setup', '--palace', target], PROTECTED);
  assert.strictEqual(ok(result).palace, target);
  const output = `${result.stdout}${result.stderr}`;
  assert.ok(output.includes(repo), `${output} does not name ${repo}`);
  assert.match(output, /git repository/);
});

test('enclosing repo: inherited GIT_DIR and GIT_WORK_TREE do not move the check', async (t) => {
  const { root, env, repo, target } = repoBox(t, null);
  const other = path.join(root, 'other');
  git(env, ['init', '-q', other]);
  const misled = { ...env, GIT_DIR: path.join(other, '.git'), GIT_WORK_TREE: other };
  const stderr = failed(await cli(misled, ['setup', '--palace', target], SETTINGS), 'inside the repo');
  assert.ok(stderr.includes(`git repository ${repo} `), `${stderr} does not name ${repo}`);
  assert.ok(!stderr.includes(other), `${stderr} names ${other}`);
  nothingWritten(env, target);
  const outside = path.join(root, 'outside');
  assert.strictEqual(ok(await cli(misled, ['setup', '--palace', outside], SETTINGS)).palace, outside);
});

test('enclosing repo owned by another user is an error', async (t) => {
  const { env, target } = repoBox(t, null);
  const stderr = failed(await cli({ ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }, ['setup', '--palace', target], SETTINGS), 'other owner');
  assert.match(stderr, /dubious ownership/);
  nothingWritten(env, target);
});

test('setup with a malformed git config fails and writes nothing', async (t) => {
  const { root, env, dir } = sandbox(t);
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '[[[not a section\n');
  const stderr = failed(await cli(env, ['setup', '--palace', dir], SETTINGS), 'malformed config');
  assert.match(stderr, /configuration/);
  assert.match(stderr, /bad config/);
  nothingWritten(env, path.join(root, 'palace'));
});

test('setup with no git on PATH succeeds', async (t) => {
  const { root, env, dir } = sandbox(t);
  const empty = path.join(root, 'no-git-bin');
  fs.mkdirSync(empty);
  assert.strictEqual(ok(await cli({ ...env, PATH: empty }, ['setup', '--palace', dir], SETTINGS)).palace, dir);
});
