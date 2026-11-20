'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setup, join, open } = require('./lib/palace.js');
const { carriesSecret } = require('./lib/git.js');
const { cli, support, envFor, hashes, scan } = require('./test-support.js');

const VAR = 'MP_TEST_PASSPHRASE';
const PASS = 'MKPLpass-fake-passphrase-0000';
const SETTINGS = { backend: 'folder', passphrase: null, kinds: ['note'], moments: ['on-request'] };
const PROTECTED = { ...SETTINGS, passphrase: { env: VAR }, kdf: { N: 2 ** 14 } };
const IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid'];
const OWNED = /^(palace\.json|meta|\.gitignore|pages\/[0-9a-f]{2}\/[0-9a-f]{32})$/;
const DIVERGED = /both changed since they last matched/;
const FOREIGN = /the remote holds files memory-palace did not write/;
const NOT_EMPTY = /the remote is not empty/;
const UNREACHABLE = /does not appear to be a git repository/;
const NOT_SYNCED = /saved locally, not yet synced/;
const OWN_REPO = /has its own git repository\. Pass this palace's remote URL to join as "remote", or null if it has none/;
const NO_REPO = /has no git repository, so join cannot attach a remote/;
const SECRET = /password or token/;
const FOREIGN_KEY = (key) => new RegExp(`"${key.replace('.', '\\.')}", which memory-palace did not write`, 'i');

let tags = 0;
const tag = () => `MKPL${String(++tags).padStart(4, '0')}q7Zx`;

function memoryOf(mark, place = `wing/${mark}P/room`) {
  return { place, title: `${mark}T`, summary: `${mark}S`, text: `${mark}X`, kind: 'note' };
}

const needlesOf = (memory) => [memory.place.split('/')[1], memory.title, memory.summary, memory.text];

function git(env, args) {
  return execFileSync('git', [...IDENTITY, ...args], { env, timeout: 10000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const objects = (env, gitDir) =>
  execFileSync('git', ['--git-dir', gitDir, 'cat-file', '--batch-all-objects', '--batch'], { env, timeout: 10000, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const refs = (env, gitDir) => git(env, ['--git-dir', gitDir, 'for-each-ref', '--format=%(refname) %(objectname)']);
const remoteState = (env, bare) => ({ refs: refs(env, bare), objects: git(env, ['--git-dir', bare, 'cat-file', '--batch-all-objects', '--batch-check']) });
const headOf = (env, dir) => git(env, ['-C', dir, 'rev-parse', 'HEAD']).trim();
const mainOf = (env, bare) => git(env, ['--git-dir', bare, 'rev-parse', 'refs/heads/main']).trim();
const recordedOf = (env, dir) => JSON.parse(readFile(machineFile(env))).palaces[dir]?.origin;
const linkKeys = (env, dir) => git(env, ['-C', dir, 'config', '--local', '--name-only', '--list']).split('\n').filter((key) => /^(remote|branch)\./.test(key));
const trackedOn = (env, bare) => git(env, ['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main']).split('\n').filter(Boolean);
const readFile = (file) => fs.readFileSync(file, 'utf8');
const machineFile = (env) => path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
const output = (result) => `${result.stdout}${result.stderr}`;
const workFiles = (dir) => Object.fromEntries(Object.entries(hashes(dir)).filter(([file]) => !file.startsWith(`.git${path.sep}`)));
const palaceState = (env, dir) => ({ settings: readFile(path.join(dir, 'palace.json')), origin: recordedOf(env, dir), refs: refs(env, path.join(dir, '.git')) });

function script(file, body) {
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

function hooked(box, name) {
  const marker = box.at(`${name}-hook-ran`);
  const url = box.bare(name);
  script(path.join(url, 'hooks', 'pre-receive'), `touch '${marker}'`);
  return { url, ran: () => fs.existsSync(marker) };
}

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-sync-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const at = (name) => path.join(root, name);
  const refuse = script(at('refuse-ssh'), 'echo "test transport: refused, no connection made" >&2\nexit 1');
  const home = (name) => ({ ...envFor(at(name)), GIT_ALLOW_PROTOCOL: 'file:ssh', GIT_SSH_COMMAND: refuse, GIT_SSH_VARIANT: 'simple', [VAR]: PASS });
  const env = home('a');
  const bare = (name) => {
    git(env, ['init', '-q', '--bare', '-b', 'main', at(name)]);
    return at(name);
  };
  return { root, at, home, env, bare };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function failed(result, what) {
  assert.strictEqual(result.code, 1, `${what}: exit ${result.code} ${result.signal || ''}: ${result.stdout} ${result.stderr}`);
  return result.stderr;
}

function noTempSibling(dir) {
  assert.deepStrictEqual(fs.readdirSync(dir).filter((name) => name.includes('.setup-')), [], 'a temp sibling is left');
}

const within = (env, dir, work, ctx = {}) => work(open({ env, palace: dir, ...ctx }));

const saveIn = (env, dir, ...memories) => within(env, dir, (palace) => memories.map((memory) => palace.save(memory)));

function onlinePalace(box, { env = box.env, name = 'palace', settings = SETTINGS, confirm = true } = {}) {
  const dir = box.at(name);
  const remote = box.bare(`${name}-remote.git`);
  setup(dir, { ...settings, remote, ...(confirm && { private: true }) }, { env });
  return { dir, remote };
}

function commitFiles(env, work, files) {
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(work, name), text);
  git(env, ['-C', work, 'add', '-f', '--', ...Object.keys(files)]);
  git(env, ['-C', work, 'commit', '-q', '-m', 'outside change']);
}

function seeded(box, name, ref = 'refs/heads/main') {
  const remote = box.bare(name);
  const work = box.at(`${name}-work`);
  git(box.env, ['init', '-q', '-b', 'main', work]);
  commitFiles(box.env, work, { 'README.md': 'hello\n' });
  git(box.env, ['-C', work, 'push', '-q', remote, `HEAD:${ref}`]);
  return remote;
}

function diverged(box) {
  const a = box.env;
  const b = box.home('b');
  const { dir: dirA, remote } = onlinePalace(box, { name: 'a-palace' });
  saveIn(a, dirA, memoryOf(tag()));
  const dirB = box.at('b-palace');
  join(dirB, { remote, passphrase: null }, { env: b });
  fs.renameSync(remote, `${remote}.away`);
  const fromA = memoryOf(tag());
  saveIn(a, dirA, fromA);
  saveIn(b, dirB, memoryOf(tag()));
  fs.renameSync(`${remote}.away`, remote);
  within(a, dirA, (palace) => palace.sync());
  return { a, b, dirA, dirB, remote, fromA };
}

function foreignRemote(box) {
  const { env } = box;
  const { dir, remote } = onlinePalace(box);
  const memory = memoryOf(tag());
  saveIn(env, dir, memory);
  const other = box.at('other-clone');
  git(env, ['clone', '-q', '--branch', 'main', remote, other]);
  commitFiles(env, other, { 'README.md': 'hello\n', lock: '{}\n' });
  git(env, ['-C', other, 'push', '-q', 'origin', 'main']);
  return { env, dir, remote, memory, other };
}

test('E1: B joins from A\'s remote', async (t) => {
  const box = sandbox(t);
  const b = box.home('b');
  const { remote } = onlinePalace(box);
  const fromA = [memoryOf(tag()), memoryOf(tag())];
  for (const memory of fromA) ok(await cli(box.env, ['save'], memory));
  ok(await cli(box.env, ['sync']));

  const dirB = box.at('b-palace');
  assert.deepStrictEqual(ok(await cli(b, ['join', '--palace', dirB], { remote, passphrase: null })), { joined: dirB, default: dirB });
  const status = ok(await cli(b, ['status']));
  assert.strictEqual(status.online, true);
  assert.strictEqual(status.remote, remote);
  for (const memory of fromA) assert.strictEqual(ok(await cli(b, ['recall'], { place: memory.place })).text, memory.text);

  const fromB = memoryOf(tag());
  ok(await cli(b, ['save'], fromB));
  ok(await cli(b, ['sync']));
  assert.strictEqual(ok(await cli(box.env, ['recall'], { place: fromB.place })).text, fromB.text);
});

test('setup refuses a remote holding a README', async (t) => {
  const box = sandbox(t);
  setup(box.at('first'), SETTINGS, { env: box.env });
  const record = readFile(machineFile(box.env));
  const remote = seeded(box, 'readme.git');
  const target = box.at('palace');
  assert.match(failed(await cli(box.env, ['setup', '--palace', target], { ...SETTINGS, remote, private: true }), 'setup'), NOT_EMPTY);
  assert.ok(!fs.existsSync(target), `${target} exists`);
  noTempSibling(box.root);
  assert.strictEqual(readFile(machineFile(box.env)), record);
});

test('setup and remote refuse an unreachable remote', async (t) => {
  const box = sandbox(t);
  const missing = box.at('missing.git');
  const target = box.at('palace');
  assert.match(failed(await cli(box.env, ['setup', '--palace', target], { ...SETTINGS, remote: missing, private: true }), 'setup'), UNREACHABLE);
  assert.ok(!fs.existsSync(target), `${target} exists`);
  noTempSibling(box.root);
  assert.ok(!fs.existsSync(machineFile(box.env)), 'a machine record was written');

  const { dir } = onlinePalace(box, { name: 'online' });
  const before = palaceState(box.env, dir);
  assert.match(failed(await cli(box.env, ['remote', '--palace', dir], { url: missing, private: true }), 'remote'), UNREACHABLE);
  assert.deepStrictEqual(palaceState(box.env, dir), before);
});

test('a remote with only refs/heads/topic/main counts as empty', async (t) => {
  const box = sandbox(t);
  const remote = seeded(box, 'topic.git', 'refs/heads/topic/main');
  const dir = box.at('palace');
  ok(await cli(box.env, ['setup', '--palace', dir], { ...SETTINGS, remote, private: true }));
  assert.ok(trackedOn(box.env, remote).includes('palace.json'), 'main does not hold the palace');
  assert.strictEqual(mainOf(box.env, remote), headOf(box.env, dir));
});

test('E2: unconfirmed unprotected push', async (t) => {
  const box = sandbox(t);
  const remote = box.bare('remote.git');
  const dir = box.at('palace');
  const made = await cli(box.env, ['setup', '--palace', dir], { ...SETTINGS, remote });
  ok(made);
  assert.match(output(made), /private/i, 'setup does not report that the push waits');
  const saved = await cli(box.env, ['save'], memoryOf(tag()));
  ok(saved);
  assert.match(output(saved), NOT_SYNCED);
  const before = remoteState(box.env, remote);
  assert.deepStrictEqual(before, { refs: '', objects: '' });

  const stderr = failed(await cli(box.env, ['sync']), 'sync');
  assert.match(stderr, /private/i);
  assert.match(stderr, /\bremote\b/);
  assert.deepStrictEqual(remoteState(box.env, remote), before);

  ok(await cli(box.env, ['remote'], { url: remote, private: true }));
  assert.strictEqual(mainOf(box.env, remote), headOf(box.env, dir));

  const sealed = onlinePalace(box, { name: 'sealed', settings: PROTECTED, confirm: false });
  ok(await cli(box.env, ['save', '--palace', sealed.dir], memoryOf(tag())));
  assert.strictEqual(mainOf(box.env, sealed.remote), headOf(box.env, sealed.dir));
});

test('E3: diverged sync stops', async (t) => {
  const box = sandbox(t);
  const { b, dirB, remote } = diverged(box);
  const state = () => ({ head: headOf(b, dirB), files: workFiles(dirB), remote: refs(b, remote) });
  const before = state();
  assert.match(failed(await cli(b, ['sync']), 'sync'), DIVERGED);
  assert.deepStrictEqual(state(), before);
  assert.match(failed(await cli(b, ['browse'], {}), 'browse'), DIVERGED);
  assert.deepStrictEqual(state(), before);
});

test('E4: git\'s error reaches the user', async (t) => {
  const box = sandbox(t);
  const { remote } = onlinePalace(box);
  script(path.join(remote, 'hooks', 'pre-receive'), 'echo "test hook: this push is refused" >&2\nexit 1');
  const saved = await cli(box.env, ['save'], memoryOf(tag()));
  ok(saved);
  assert.match(output(saved), /test hook: this push is refused/);
  assert.match(failed(await cli(box.env, ['sync']), 'sync'), /test hook: this push is refused/);
});

test('E5: unreachable remote', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  const first = memoryOf(tag());
  saveIn(box.env, dir, first);
  fs.renameSync(remote, `${remote}.away`);

  const recalled = await cli(box.env, ['recall'], { place: first.place });
  assert.strictEqual(ok(recalled).text, first.text);
  assert.match(output(recalled), UNREACHABLE);
  const saved = await cli(box.env, ['save'], memoryOf(tag()));
  ok(saved);
  assert.match(output(saved), UNREACHABLE);
  assert.match(output(saved), NOT_SYNCED);

  fs.renameSync(`${remote}.away`, remote);
  ok(await cli(box.env, ['sync']));
  assert.strictEqual(mainOf(box.env, remote), headOf(box.env, dir));
});

test('E5: known divergence with the remote gone', async (t) => {
  const box = sandbox(t);
  const { a, b, dirB, remote } = diverged(box);
  failed(await cli(b, ['sync']), 'the sync that learns of the divergence');
  fs.renameSync(remote, `${remote}.away`);
  const state = () => ({ head: headOf(b, dirB), files: workFiles(dirB) });
  const before = state();
  assert.match(failed(await cli(b, ['save'], memoryOf(tag())), 'diverged save'), DIVERGED);
  assert.deepStrictEqual(state(), before);
  for (const round of ['equal', 'ahead']) {
    const saved = await cli(a, ['save'], memoryOf(tag()));
    ok(saved);
    assert.match(output(saved), NOT_SYNCED, round);
  }
});

test('E6: a changed URL needs confirmation', async (t) => {
  const box = sandbox(t);
  const { dir } = onlinePalace(box);
  const moved = box.bare('moved.git');
  ok(await cli(box.env, ['remote'], { url: moved }));
  assert.strictEqual(refs(box.env, moved), '');
  assert.match(failed(await cli(box.env, ['sync']), 'sync'), /private/i);
  assert.strictEqual(refs(box.env, moved), '');
  ok(await cli(box.env, ['remote'], { url: moved, private: true }));
  assert.strictEqual(mainOf(box.env, moved), headOf(box.env, dir));
});

test('J3: settings hold no machine path', async (t) => {
  const box = sandbox(t);
  const b = box.home('b');
  const { dir, remote } = onlinePalace(box, { settings: PROTECTED, confirm: false });
  const memory = memoryOf(tag());
  saveIn(box.env, dir, memory);
  const settings = readFile(path.join(dir, 'palace.json'));
  assert.ok(!settings.includes(box.root), `${settings} holds a machine path`);

  const keyFile = box.at('b-only-key');
  fs.writeFileSync(keyFile, `${PASS}\n`, { mode: 0o600 });
  const dirB = box.at('b-palace');
  ok(await cli(b, ['join', '--palace', dirB], { remote, passphrase: { file: keyFile } }));
  assert.strictEqual(ok(await cli(b, ['recall'], { place: memory.place })).text, memory.text);
  ok(await cli(b, ['save'], memoryOf(tag())));
  assert.strictEqual(ok(await cli(box.env, ['browse'], {})).memories.length, 2);
  assert.strictEqual(readFile(path.join(dir, 'palace.json')), settings);
  assert.strictEqual(readFile(path.join(dirB, 'palace.json')), settings);
});

test('remote with private: true on a protected palace keeps its settings check valid', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box, { settings: PROTECTED, confirm: false });
  const memory = memoryOf(tag());
  saveIn(box.env, dir, memory);
  ok(await cli(box.env, ['remote'], { url: remote, private: true }));
  assert.strictEqual(ok(await cli(box.env, ['status'])).privateRemote, remote);
  assert.strictEqual(ok(await cli(box.env, ['recall'], { place: memory.place })).text, memory.text);
});

test('remote refuses an unrelated remote', async (t) => {
  const box = sandbox(t);
  const { dir } = onlinePalace(box);
  const other = onlinePalace(box, { name: 'other' });
  saveIn(box.env, other.dir, memoryOf(tag()));
  const before = palaceState(box.env, dir);
  assert.match(failed(await cli(box.env, ['remote', '--palace', dir], { url: other.remote, private: true }), 'remote'), NOT_EMPTY);
  assert.deepStrictEqual(palaceState(box.env, dir), before);
});

test('remote on an offline palace leaves no .git when refused', async (t) => {
  const box = sandbox(t);
  const dir = box.at('palace');
  setup(dir, SETTINGS, { env: box.env });
  const remote = seeded(box, 'readme.git');
  assert.match(failed(await cli(box.env, ['remote', '--palace', dir], { url: remote, private: true }), 'remote'), NOT_EMPTY);
  assert.ok(!fs.existsSync(path.join(dir, '.git')), 'a refused remote left .git');
});

test('remote refuses a remote whose main tracks foreign files, before switching', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  saveIn(box.env, dir, memoryOf(tag()));
  const work = box.at('work');
  git(box.env, ['clone', '-q', '--branch', 'main', remote, work]);
  commitFiles(box.env, work, { 'README.md': 'hello\n' });
  const foreign = box.bare('foreign.git');
  git(box.env, ['-C', work, 'push', '-q', foreign, 'HEAD:refs/heads/main']);

  const stderr = failed(await cli(box.env, ['remote', '--palace', dir], { url: foreign, private: true }), 'remote');
  assert.match(stderr, FOREIGN);
  assert.ok(stderr.includes('README.md'), stderr);
  assert.strictEqual(recordedOf(box.env, dir), remote);
});

test('remote accepts a remote that is behind', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  saveIn(box.env, dir, memoryOf(tag()));
  const behind = box.bare('behind.git');
  git(box.env, ['--git-dir', remote, 'push', '-q', behind, 'main']);
  saveIn(box.env, dir, memoryOf(tag()));
  ok(await cli(box.env, ['remote', '--palace', dir], { url: behind, private: true }));
  ok(await cli(box.env, ['sync']));
  assert.strictEqual(mainOf(box.env, behind), headOf(box.env, dir));
});

test('remote accepts a remote that is ahead', async (t) => {
  const box = sandbox(t);
  const b = box.home('b');
  const { dir, remote } = onlinePalace(box);
  saveIn(box.env, dir, memoryOf(tag()));
  const ahead = box.bare('ahead.git');
  const dirB = box.at('b-palace');
  join(dirB, { remote, passphrase: null }, { env: b });
  within(b, dirB, (palace) => palace.setRemote({ url: ahead, private: true }));
  const fromB = memoryOf(tag());
  saveIn(b, dirB, fromB);

  ok(await cli(box.env, ['remote', '--palace', dir], { url: ahead, private: true }));
  assert.strictEqual(ok(await cli(box.env, ['recall'], { place: fromB.place })).text, fromB.text);
  ok(await cli(box.env, ['save'], memoryOf(tag())));
  assert.strictEqual(mainOf(box.env, ahead), headOf(box.env, dir));
});

test('remote with private: true stops when the fetch after the switch fails', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  saveIn(box.env, dir, memoryOf(tag()));
  const count = box.at('connections');
  const serveTwice = script(box.at('serve-twice-ssh'), [
    `n=$(( $(cat "${count}" 2>/dev/null || echo 0) + 1 ))`,
    `echo "$n" > "${count}"`,
    'if [ "$n" -ge 3 ]; then echo "test transport: connection $n refused" >&2; exit 1; fi',
    'exec sh -c "$2"',
  ].join('\n'));
  const state = () => ({ settings: readFile(path.join(dir, 'palace.json')), head: headOf(box.env, dir) });
  const before = state();
  const env = { ...box.env, GIT_SSH_COMMAND: serveTwice };
  const stderr = failed(await cli(env, ['remote', '--palace', dir], { url: `ssh://example.invalid${remote}`, private: true }), 'remote');
  assert.match(stderr, /test transport: connection 3 refused/);
  assert.strictEqual(readFile(count).trim(), '3');
  assert.deepStrictEqual(state(), before);
});

test('moved remote: diverged palace moved to an empty remote syncs', async (t) => {
  const box = sandbox(t);
  const { b, dirB } = diverged(box);
  failed(await cli(b, ['sync']), 'the sync that learns of the divergence');
  const stale = git(b, ['-C', dirB, 'rev-parse', 'refs/remotes/origin/main']).trim();
  const fresh = box.bare('fresh.git');
  ok(await cli(b, ['remote'], { url: fresh, private: true }));
  assert.ok(!refs(b, path.join(dirB, '.git')).includes(stale), 'the old origin/main survived');
  ok(await cli(b, ['sync']));
  const saved = await cli(b, ['save'], memoryOf(tag()));
  ok(saved);
  assert.doesNotMatch(output(saved), NOT_SYNCED);
  assert.strictEqual(mainOf(b, fresh), headOf(b, dirB));
});

test('diverged palace whose remote was emptied at the same URL syncs', async (t) => {
  const box = sandbox(t);
  const { b, dirB, remote } = diverged(box);
  failed(await cli(b, ['sync']), 'the sync that learns of the divergence');
  fs.rmSync(remote, { recursive: true });
  box.bare(path.basename(remote));
  ok(await cli(b, ['sync']));
  const saved = await cli(b, ['save'], memoryOf(tag()));
  ok(saved);
  assert.doesNotMatch(output(saved), NOT_SYNCED);
  assert.strictEqual(mainOf(b, remote), headOf(b, dirB));
});

test('divergence way out', async (t) => {
  const box = sandbox(t);
  const { b, dirB, remote, fromA } = diverged(box);
  assert.match(failed(await cli(b, ['sync']), 'sync'), /\bjoin\b/);
  const state = () => ({ head: headOf(b, dirB), files: workFiles(dirB) });
  const before = state();
  const fresh = box.at('fresh-copy');
  assert.deepStrictEqual(ok(await cli(b, ['join', '--palace', fresh], { remote, passphrase: null })), { joined: fresh, default: fresh });
  assert.strictEqual(ok(await cli(b, ['recall'], { place: fromA.place })).text, fromA.text);
  assert.strictEqual(ok(await cli(b, ['status'])).palace, fresh);
  assert.deepStrictEqual(state(), before);
});

test('join of a new folder sets the default', async (t) => {
  const box = sandbox(t);
  const { remote } = onlinePalace(box);
  const b = box.home('b');
  setup(box.at('b-own'), SETTINGS, { env: b });
  const joined = box.at('b-joined');
  assert.deepStrictEqual(ok(await cli(b, ['join', '--palace', joined], { remote, passphrase: null })), { joined, default: joined });
  assert.strictEqual(ok(await cli(b, ['status'])).palace, joined);
});

test('join of a registered folder keeps the default', async (t) => {
  const box = sandbox(t);
  const { remote } = onlinePalace(box);
  const b = box.home('b');
  const first = box.at('b-first');
  const second = box.at('b-second');
  join(first, { remote, passphrase: null }, { env: b });
  join(second, { remote, passphrase: null }, { env: b });
  assert.deepStrictEqual(ok(await cli(b, ['join', '--palace', first], { passphrase: null })), { joined: first, default: second });
  assert.strictEqual(ok(await cli(b, ['status'])).palace, second);
});

test('join --palace on a hand clone opens it', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  const memory = memoryOf(tag());
  saveIn(box.env, dir, memory);
  const b = box.home('b');
  const hand = box.at('hand');
  git(b, ['clone', '-q', '--branch', 'main', remote, hand]);
  assert.ok(!fs.existsSync(path.join(hand, 'lock')));
  const refused = await cli(b, ['join', '--palace', hand], { passphrase: null });
  assert.match(failed(refused, 'join without remote'), OWN_REPO);
  assert.ok(!output(refused).includes(remote), output(refused));
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');

  assert.deepStrictEqual(ok(await cli(b, ['join', '--palace', hand], { passphrase: null, remote })), { joined: hand, default: hand });
  assert.deepStrictEqual(linkKeys(b, hand), []);
  assert.strictEqual(ok(await cli(b, ['recall'], { place: memory.place })).text, memory.text);
  assert.ok(!fs.existsSync(path.join(hand, 'lock')), 'the recall left its lock');
  assert.strictEqual(ok(await cli(b, ['save'], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(b, remote), headOf(b, hand));
});

test('join of an unknown folder with a .git must state its remote', async (t) => {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box);
  saveIn(box.env, dir, memoryOf(tag()));
  const b = box.home('b');
  const copies = ['missing', 'none', 'url'].map((name) => box.at(`b-${name}`));
  for (const copy of copies) fs.cpSync(dir, copy, { recursive: true });
  const [missing, none, url] = copies;
  assert.match(failed(await cli(b, ['join', '--palace', missing], { passphrase: null }), 'no remote key'), OWN_REPO);
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');
  ok(await cli(b, ['join', '--palace', none], { passphrase: null, remote: null }));
  assert.strictEqual(ok(await cli(b, ['save', '--palace', none], memoryOf(tag()))).synced, false);
  ok(await cli(b, ['join', '--palace', url], { passphrase: null, remote }));
  assert.strictEqual(ok(await cli(b, ['save', '--palace', url], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(b, remote), headOf(b, url));
});

test('join of an unknown offline folder refuses a remote URL', async (t) => {
  const box = sandbox(t);
  const dir = box.at('palace');
  setup(dir, SETTINGS, { env: box.env });
  const b = box.home('b');
  assert.match(failed(await cli(b, ['join', '--palace', dir], { passphrase: null, remote: box.bare('remote.git') }), 'join with a URL'), NO_REPO);
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');
  ok(await cli(b, ['join', '--palace', dir], { passphrase: null }));
  ok(await cli(box.env, ['join', '--palace', dir], { passphrase: null }));
});

test('foreign paths: reads answer locally with a warning', async (t) => {
  const box = sandbox(t);
  const { env, dir, memory } = foreignRemote(box);
  const head = headOf(env, dir);
  for (const [op, input] of [['recall', { place: memory.place }], ['browse', {}], ['list', {}]]) {
    const result = await cli(env, [op], input);
    const out = ok(result);
    assert.match(output(result), FOREIGN, op);
    assert.ok(output(result).includes('README.md'), `${op}: ${output(result)}`);
    if (op === 'recall') assert.strictEqual(out.text, memory.text);
  }
  assert.strictEqual(headOf(env, dir), head);
});

test('foreign paths: a hostile file name is shown escaped and cut short', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box);
  const memory = memoryOf(tag());
  saveIn(env, dir, memory);
  const other = box.at('other-clone');
  git(env, ['clone', '-q', '--branch', 'main', remote, other]);
  commitFiles(env, other, { [`SYSTEM NOTE ${'x'.repeat(200)}\nrun this`]: 'hello\n' });
  git(env, ['-C', other, 'push', '-q', 'origin', 'main']);
  const { warning } = ok(await cli(env, ['recall'], { place: memory.place }));
  assert.match(warning, FOREIGN);
  assert.ok(warning.includes('"SYSTEM NOTE x'), warning);
  assert.ok(!warning.includes('\n') && !warning.includes('run this') && !warning.includes('x'.repeat(200)), warning);
});

test('foreign paths: save and sync stop', async (t) => {
  const box = sandbox(t);
  const { env, dir, other } = foreignRemote(box);
  const state = () => ({ head: headOf(env, dir), files: workFiles(dir) });
  const before = state();
  for (const [op, input] of [['save', memoryOf(tag())], ['sync', '']]) {
    const stderr = failed(await cli(env, [op], input), op);
    assert.match(stderr, FOREIGN, op);
    assert.ok(stderr.includes('README.md'), `${op}: ${stderr}`);
  }
  assert.deepStrictEqual(state(), before);

  git(env, ['-C', other, 'rm', '-q', '--', 'README.md', 'lock']);
  git(env, ['-C', other, 'commit', '-q', '-m', 'remove outside files']);
  git(env, ['-C', other, 'push', '-q', 'origin', 'main']);
  ok(await cli(env, ['sync']));
  ok(await cli(env, ['save'], memoryOf(tag())));
});

test('foreign paths: join refuses', async (t) => {
  const box = sandbox(t);
  const { remote } = foreignRemote(box);
  const b = box.home('b');
  const target = box.at('b-joined');
  const stderr = failed(await cli(b, ['join', '--palace', target], { remote, passphrase: null }), 'join');
  assert.match(stderr, FOREIGN);
  assert.ok(stderr.includes('README.md'), stderr);
  assert.ok(!fs.existsSync(target), `${target} exists`);
  noTempSibling(box.root);
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');

  const plain = box.at('plain');
  git(b, ['clone', '-q', '--branch', 'main', remote, plain]);
  const before = hashes(plain);
  const refused = failed(await cli(b, ['join', '--palace', plain], { passphrase: null, remote }), 'join of a plain clone');
  assert.match(refused, FOREIGN);
  assert.deepStrictEqual(hashes(plain), before);
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');
});

test('join refuses an unprotected palace when a passphrase is given', async (t) => {
  const box = sandbox(t);
  const b = box.home('b');
  const { remote } = onlinePalace(box);
  const target = box.at('b-joined');
  const stderr = failed(await cli(b, ['join', '--palace', target], { remote, passphrase: { env: VAR } }), 'join');
  for (const part of [/not protected/, /passphrase was given/, /altered/, /Nothing was written/]) assert.match(stderr, part);
  assert.ok(!fs.existsSync(target), `${target} exists`);
  noTempSibling(box.root);
  assert.ok(!fs.existsSync(machineFile(b)), 'a machine record was written');
});

test('join never lowers a recorded protection pin', async (t) => {
  const box = sandbox(t);
  const dir = box.at('palace');
  setup(dir, PROTECTED, { env: box.env });
  const settingsFile = path.join(dir, 'palace.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ ...JSON.parse(readFile(settingsFile)), protected: false, kdf: null, check: null }));
  const record = readFile(machineFile(box.env));
  for (const passphrase of [null, { env: VAR }]) {
    const stderr = failed(await cli(box.env, ['join', '--palace', dir], { passphrase }), JSON.stringify(passphrase));
    assert.match(stderr, /settings mismatch/);
    assert.strictEqual(readFile(machineFile(box.env)), record);
  }
});

function pushSettings(box, remote, change) {
  const other = box.at('settings-clone');
  git(box.env, ['clone', '-q', '--branch', 'main', remote, other]);
  const file = path.join(other, 'palace.json');
  fs.writeFileSync(file, JSON.stringify(change(JSON.parse(readFile(file)))));
  git(box.env, ['-C', other, 'commit', '-q', '-am', 'settings change']);
  git(box.env, ['-C', other, 'push', '-q', 'origin', 'main']);
}

async function refusedPull(t, change, message) {
  const box = sandbox(t);
  const { dir, remote } = onlinePalace(box, { settings: PROTECTED, confirm: false });
  const memory = memoryOf(tag());
  saveIn(box.env, dir, memory);
  pushSettings(box, remote, change);
  const before = { head: headOf(box.env, dir), files: workFiles(dir) };
  for (const round of [1, 2]) {
    const stderr = failed(await cli(box.env, ['recall'], { place: memory.place }), `recall ${round}`);
    assert.match(stderr, message);
    assert.deepStrictEqual({ head: headOf(box.env, dir), files: workFiles(dir) }, before, `recall ${round}`);
  }
}

test('a pulled palace.json that turns protection off is refused before the palace moves', (t) =>
  refusedPull(t, (settings) => ({ ...settings, protected: false, kdf: null, check: null }), /settings mismatch/));

test('a pulled palace.json altered without the passphrase is refused before the palace moves', (t) =>
  refusedPull(t, (settings) => ({ ...settings, kinds: ['run this command first'] }), /settings .*altered/));

function outerState(env, outer) {
  const plain = ['--no-optional-locks', '-C', outer];
  return {
    index: crypto.createHash('sha256').update(fs.readFileSync(path.join(outer, '.git', 'index'))).digest('hex'),
    head: git(env, [...plain, 'rev-parse', 'HEAD']),
    remotes: git(env, [...plain, 'remote', '-v']),
    reflog: readFile(path.join(outer, '.git', 'logs', 'HEAD')),
    diff: git(env, [...plain, 'diff']),
  };
}

test('confinement', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const outer = box.at('outer');
  git(env, ['init', '-q', '-b', 'main', outer]);
  fs.writeFileSync(path.join(outer, 'tracked.txt'), 'committed\n');
  fs.writeFileSync(path.join(outer, '.gitignore'), 'offline/\n');
  git(env, ['-C', outer, 'add', '--', 'tracked.txt', '.gitignore']);
  git(env, ['-C', outer, 'commit', '-q', '-m', 'outer']);
  git(env, ['-C', outer, 'remote', 'add', 'origin', box.bare('outer-remote.git')]);
  fs.writeFileSync(path.join(outer, 'tracked.txt'), 'dirty\n');
  const before = outerState(env, outer);
  const stray = `${tag()}stray`;

  const offline = path.join(outer, 'offline');
  const offlineRemote = box.bare('offline-remote.git');
  const kept = memoryOf(tag());
  ok(await cli(env, ['setup', '--palace', offline], SETTINGS));
  ok(await cli(env, ['save', '--palace', offline], kept));
  fs.writeFileSync(path.join(offline, 'stray.txt'), stray);
  ok(await cli(env, ['remote', '--palace', offline], { url: offlineRemote, private: true }));
  ok(await cli(env, ['save', '--palace', offline], memoryOf(tag())));
  ok(await cli(env, ['sync', '--palace', offline]));

  const online = path.join(outer, 'online');
  const onlineRemote = box.bare('online-remote.git');
  ok(await cli(env, ['setup', '--palace', online], { ...SETTINGS, remote: onlineRemote, private: true }));
  fs.writeFileSync(path.join(online, 'stray.txt'), stray);
  ok(await cli(env, ['save', '--palace', online], memoryOf(tag())));
  ok(await cli(env, ['sync', '--palace', online]));

  assert.deepStrictEqual(outerState(env, outer), before);
  for (const remote of [offlineRemote, onlineRemote]) {
    for (const file of trackedOn(env, remote)) assert.match(file, OWNED, remote);
    assert.ok(!objects(env, remote).includes(stray), `${remote} holds the stray file`);
  }
  assert.ok(objects(env, offlineRemote).includes(kept.text), 'control: the object scan found no memory in an unprotected remote');
});

test('hostile config', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const remote = box.bare('remote.git');
  const hooks = box.at('hooks');
  fs.mkdirSync(hooks);
  script(path.join(hooks, 'pre-commit'), 'echo "test hook: commit refused" >&2\nexit 1');
  const excludes = box.at('excludes');
  fs.writeFileSync(excludes, '*.json\nmeta\npages\n');
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, [
    '[core]', `\thooksPath = ${hooks}`, `\texcludesFile = ${excludes}`,
    '[commit]', '\tgpgsign = true',
    '[gpg]', '\tprogram = false',
    '[user]', '\tuseConfigOnly = true',
    '',
  ].join('\n'));

  const dir = box.at('palace');
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, remote, private: true }));
  ok(await cli(env, ['save'], memoryOf(tag())));
  ok(await cli(env, ['sync']));
  const files = trackedOn(env, remote);
  for (const owned of ['palace.json', 'meta', '.gitignore']) assert.ok(files.includes(owned), `the remote lacks ${owned}: ${files}`);
  assert.strictEqual(mainOf(env, remote), headOf(env, dir));
  assert.strictEqual(git(env, ['-C', dir, 'show', 'HEAD:meta']), readFile(path.join(dir, 'meta')));
});

test('insteadOf', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const remote = box.bare('remote.git');
  const url = 'ssh://example.invalid/palace.git';
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, `[url "${remote}"]\n\tinsteadOf = ${url}\n`);
  const dir = box.at('palace');
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, remote: url, private: true }));
  ok(await cli(env, ['save'], memoryOf(tag())));
  assert.strictEqual(ok(await cli(env, ['status'])).remote, url);
  assert.strictEqual(mainOf(env, remote), headOf(env, dir));
});

function killListed(file) {
  if (!fs.existsSync(file)) return;
  for (const pid of readFile(file).split('\n').filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }
}

test('timeout', async (t) => {
  const box = sandbox(t);
  const remote = box.bare('remote.git');
  const mode = box.at('ssh-mode');
  const pids = box.at('ssh-pids');
  fs.writeFileSync(mode, 'serve');
  const slow = script(box.at('slow-ssh'), [
    `if [ "$(cat "${mode}")" = hang ]; then echo $$ >> "${pids}"; exec sleep 15; fi`,
    'exec sh -c "$2"',
  ].join('\n'));
  const env = { ...box.env, GIT_SSH_COMMAND: slow };
  const dir = box.at('palace');
  setup(dir, { ...SETTINGS, remote: `ssh://example.invalid${remote}`, private: true }, { env });
  const memory = memoryOf(tag());
  saveIn(env, dir, memory);

  fs.writeFileSync(mode, 'hang');
  const gitTimeoutMs = 1000;
  const timedRun = async (op, input) => {
    const started = Date.now();
    const result = await support(env, { palace: dir, gitTimeoutMs, ops: [{ op, input }] }).done;
    return { result, ms: Date.now() - started };
  };
  try {
    const recalled = await timedRun('recall', { place: memory.place });
    assert.strictEqual(ok(recalled.result)[0].text, memory.text);
    assert.match(output(recalled.result), /timed out/);
    assert.ok(recalled.ms < gitTimeoutMs + 2000, `the recall took ${recalled.ms} ms with one hanging fetch`);
    const saved = await timedRun('save', memoryOf(tag()));
    ok(saved.result);
    assert.match(output(saved.result), NOT_SYNCED);
    assert.ok(saved.ms < 2 * gitTimeoutMs + 2000, `the save took ${saved.ms} ms with a hanging fetch and push`);
  } finally {
    killListed(pids);
  }
});

test('an origin URL that carries a secret in the palace configuration or the machine record is refused', async (t) => {
  const box = sandbox(t);
  const { dir } = onlinePalace(box);
  const url = 'https://user:MKPLsecret0q7Zx@example.invalid/palace.git';
  git(box.env, ['-C', dir, 'config', 'remote.origin.url', url]);
  const record = JSON.parse(readFile(machineFile(box.env)));
  for (const [where, message] of [['configuration', FOREIGN_KEY('remote.origin.url')], ['record', SECRET]]) {
    if (where === 'record') {
      git(box.env, ['-C', dir, 'config', '--remove-section', 'remote.origin']);
      record.palaces[dir].origin = url;
      fs.writeFileSync(machineFile(box.env), JSON.stringify(record));
    }
    for (const [command, input] of [['status'], ['browse', {}], ['save', memoryOf(tag())]]) {
      const stderr = failed(await cli(box.env, [command, '--palace', dir], input), `${where} ${command}`);
      assert.match(stderr, message, `${where} ${command}`);
      assert.ok(!stderr.includes('MKPLsecret0q7Zx'), `${where} ${command}: ${stderr}`);
    }
  }
});

test('credentials in URL refused', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const secrets = [
    ['https://MKPLtok1@example.invalid/x.git', 'MKPLtok1'],
    ['https://u:MKPLpw2@example.invalid/x.git', 'MKPLpw2'],
    ['ssh://git:MKPLpw3@example.invalid/x.git', 'MKPLpw3'],
    ['https://example.invalid/x.git?access_token=MKPLtok4', 'MKPLtok4'],
    ['https://example.invalid/x.git#MKPLtok5', 'MKPLtok5'],
    ['https::https://u:MKPLtok6@example.invalid/x.git', 'MKPLtok6'],
    ['ext::MKPLcmd7 %S', 'MKPLcmd7'],
  ];
  for (const [url] of secrets) assert.strictEqual(carriesSecret(url), true, url);
  for (const url of ['ssh://git@example.invalid/x.git', 'git@example.invalid:x.git', '/srv/palace.git', 'palace.git', 'https://example.invalid/x.git']) {
    assert.strictEqual(carriesSecret(url), false, url);
  }

  const { dir } = onlinePalace(box);
  const before = palaceState(env, dir);
  const record = readFile(machineFile(env));
  const target = box.at('new');
  for (const [url, secret] of secrets) {
    const attempts = [
      [['setup', '--palace', target], { ...SETTINGS, remote: url, private: true }],
      [['join', '--palace', target], { remote: url, passphrase: null }],
      [['remote', '--palace', dir], { url, private: true }],
    ];
    for (const [args, input] of attempts) {
      const what = `${args[0]} with ${secret}`;
      const result = await cli(env, args, input);
      assert.match(failed(result, what), SECRET, what);
      assert.ok(!output(result).includes(secret), `${what}: the output holds the secret`);
      assert.ok(!fs.existsSync(target), `${what}: ${target} exists`);
    }
  }
  noTempSibling(box.root);
  assert.deepStrictEqual(palaceState(env, dir), before);
  assert.strictEqual(readFile(machineFile(env)), record);
});

test('enclosing repo with a remote: gitlink only', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const outer = box.at('outer');
  git(env, ['init', '-q', '-b', 'main', outer]);
  const dir = path.join(outer, 'palace');
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, remote: box.bare('remote.git'), private: true }));
  const memory = memoryOf(tag());
  ok(await cli(env, ['save'], memory));
  ok(await cli(env, ['save'], memoryOf(tag())));

  git(env, ['-C', outer, 'add', '-A']);
  const staged = git(env, ['-C', outer, 'ls-files', '-s']).split('\n').filter(Boolean);
  assert.strictEqual(staged.length, 1, staged.join('\n'));
  assert.match(staged[0], /^160000 [0-9a-f]{40} 0\tpalace$/);
  const outerObjects = objects(env, path.join(outer, '.git'));
  const palaceObjects = objects(env, path.join(dir, '.git'));
  for (const needle of needlesOf(memory)) {
    assert.ok(!outerObjects.includes(needle), `an outer object holds ${needle}`);
    assert.ok(palaceObjects.includes(needle), `control: the palace's objects lack ${needle}`);
  }
});

function fillCell(env, dir, settings) {
  setup(dir, settings, { env });
  const kept = memoryOf(tag());
  const replaced = memoryOf(tag());
  const forgotten = memoryOf(tag());
  const replacement = memoryOf(tag(), replaced.place);
  within(env, dir, (palace) => {
    for (const memory of [kept, replaced, forgotten, replacement]) palace.save(memory);
    palace.forget({ place: forgotten.place });
    if (settings.remote) palace.sync();
  });
  return { live: [...needlesOf(kept), ...needlesOf(replacement)], all: [kept, replaced, forgotten, replacement].flatMap(needlesOf) };
}

function cell(box, protection) {
  const name = `with a remote, protection ${protection ? 'on' : 'off'}`;
  const id = protection ? 'on' : 'off';
  const env = box.home(id);
  const dir = box.at(`${id}-palace`);
  const remote = box.bare(`${id}-remote.git`);
  const settings = { ...(protection ? PROTECTED : SETTINGS), remote, private: !protection };
  const { live, all } = fillCell(env, dir, settings);
  const problems = [];
  if (protection) {
    const needles = [...all, PASS];
    for (const hit of scan([dir, env.HOME, env.TMPDIR], needles)) problems.push(`${name}: leaked, ${hit}`);
    for (const repo of [path.join(dir, '.git'), remote]) {
      const bytes = objects(env, repo);
      for (const needle of needles) if (bytes.includes(needle)) problems.push(`${name}: leaked, a decompressed object of ${repo} holds ${needle}`);
    }
    return problems;
  }
  const remoteBytes = objects(env, remote);
  for (const needle of live) {
    if (scan([dir], [needle]).length === 0) problems.push(`${name}: the control found nothing for ${needle} in the palace folder`);
    if (!remoteBytes.includes(needle)) problems.push(`${name}: the control found nothing for ${needle} in the decompressed remote`);
  }
  return problems;
}

test('B1 with a remote', (t) => {
  assert.deepStrictEqual(cell(sandbox(t), true), []);
});

test('B2 with a remote', (t) => {
  assert.deepStrictEqual(cell(sandbox(t), false), []);
});

async function plantedGit(t, config) {
  const box = sandbox(t);
  const { env } = box;
  const dir = box.at('palace');
  const memory = memoryOf(tag());
  ok(await cli(env, ['setup', '--palace', dir], PROTECTED));
  ok(await cli(env, ['save'], memory));
  git(env, ['init', '-q', '-b', 'main', dir]);
  fs.appendFileSync(path.join(dir, '.git', 'config'), config(box));
  return { box, env, dir, memory };
}

test('a planted .git whose config sets core.fsmonitor is refused by name and runs nothing', async (t) => {
  let marker;
  const { env, memory } = await plantedGit(t, (box) => {
    marker = box.at('fsmonitor-ran');
    return `[core]\n\tfsmonitor = "touch '${marker}'; false"\n`;
  });
  for (const [args, input] of [[['recall'], { place: memory.place }], [['status']]]) {
    const result = await cli(env, args, input);
    assert.match(failed(result, args[0]), FOREIGN_KEY('core.fsmonitor'), args[0]);
    assert.ok(!output(result).includes('touch'), `${args[0]}: the value was echoed`);
  }
  assert.ok(!fs.existsSync(marker), 'the fsmonitor command ran');
});

test('a planted .git whose config sets core.sshCommand is refused by name', async (t) => {
  const { env, memory } = await plantedGit(t, () => '[core]\n\tsshCommand = false\n');
  assert.match(failed(await cli(env, ['recall'], { place: memory.place }), 'recall'), FOREIGN_KEY('core.sshCommand'));
});

const PLANTED_ORIGIN = (url) => `[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;

test('a planted .git whose origin has a hook is refused by name and the hook never runs', async (t) => {
  let planted;
  const { env, dir, memory } = await plantedGit(t, (box) => {
    planted = hooked(box, 'planted.git');
    return PLANTED_ORIGIN(planted.url);
  });
  const before = hashes(dir);
  for (const [args, input] of [[['save'], memoryOf(tag())], [['recall'], { place: memory.place }], [['status']], [['remote'], { url: planted.url }]]) {
    const result = await cli(env, args, input);
    assert.match(failed(result, args[0]), FOREIGN_KEY('remote.origin.url'), args[0]);
    assert.ok(!output(result).includes(planted.url), `${args[0]}: the planted URL was echoed`);
  }
  assert.ok(!planted.ran(), 'the planted hook ran');
  assert.deepStrictEqual(hashes(dir), before);
});

test('join of a known folder refuses a planted origin by name', async (t) => {
  let planted;
  const { env, dir } = await plantedGit(t, (box) => {
    planted = hooked(box, 'planted.git');
    return PLANTED_ORIGIN(planted.url);
  });
  git(env, ['-C', dir, 'add', '-f', '--', 'palace.json', 'meta', 'pages', '.gitignore']);
  git(env, ['-C', dir, 'commit', '-q', '-m', 'planted']);
  const record = readFile(machineFile(env));
  for (const [args, input] of [[['join', '--palace', dir], { passphrase: { env: VAR }, remote: planted.url }], [['save'], memoryOf(tag())]]) {
    const result = await cli(env, args, input);
    assert.match(failed(result, args[0]), FOREIGN_KEY('remote.origin.url'), args[0]);
    assert.ok(!output(result).includes(planted.url), `${args[0]}: the planted URL was echoed`);
  }
  assert.strictEqual(readFile(machineFile(env)), record);
  assert.ok(!planted.ran(), 'the planted hook ran');
});

test('N1: a second origin URL planted before the recorded one is refused by every command and never pushed to', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box, { settings: PROTECTED, confirm: false });
  const memory = memoryOf(tag());
  saveIn(env, dir, memory);
  const planted = hooked(box, 'planted.git');
  git(env, ['-C', dir, 'config', '--replace-all', 'remote.origin.url', planted.url]);
  git(env, ['-C', dir, 'config', '--add', 'remote.origin.url', remote]);
  const commands = [
    [['status']], [['recall'], { place: memory.place }], [['browse'], {}], [['list'], {}], [['save'], memoryOf(tag())], [['forget'], { place: memory.place }],
    [['sync']], [['check']], [['remote'], { url: remote }], [['join'], { passphrase: { env: VAR }, remote }],
  ];
  for (const [args, input] of commands) {
    const result = await cli(env, [...args, '--palace', dir], input);
    assert.match(failed(result, args[0]), FOREIGN_KEY('remote.origin.url'), args[0]);
    assert.ok(!output(result).includes(planted.url), `${args[0]}: the planted URL was echoed`);
  }
  assert.ok(!planted.ran(), 'the planted hook ran');
  assert.strictEqual(refs(env, planted.url), '');
});

test('a remote, push URL or branch link set by hand is refused by name and nothing is pushed there', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box, { settings: PROTECTED });
  const other = box.bare('other.git');
  for (const [key, section] of [['remote.origin.url', 'remote.origin'], ['remote.origin.pushurl', 'remote.origin'], ['remote.mine.url', 'remote.mine'], ['branch.main.remote', 'branch.main']]) {
    git(env, ['-C', dir, 'config', key, other]);
    assert.match(failed(await cli(env, ['save', '--palace', dir], memoryOf(tag())), key), FOREIGN_KEY(key));
    assert.strictEqual(refs(env, other), '');
    git(env, ['-C', dir, 'config', '--remove-section', section]);
  }
  assert.strictEqual(ok(await cli(env, ['save', '--palace', dir], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(env, remote), headOf(env, dir));
});

test('a push goes only to the recorded remote: legacy remote files are refused, allowed settings change nothing', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const real = box.bare('remote.git');
  const url = 'example.invalid:palace.git';
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, `[url "${real}"]\n\tinsteadOf = ${url}\n`);
  const dir = box.at('palace');
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, remote: url, private: true }));
  const planted = hooked(box, 'planted.git');
  for (const file of [path.join('remotes', url), path.join('branches', url), path.join('remotes', 'origin')]) {
    const legacy = path.join(dir, '.git', file);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, file.startsWith('remotes') ? `URL: ${planted.url}\nPush: refs/heads/main:refs/heads/main\n` : `${planted.url}\n`);
    assert.match(failed(await cli(env, ['save'], memoryOf(tag())), file), /\.git[/\\](remotes|branches) holds files memory-palace did not write/);
    fs.rmSync(path.dirname(legacy), { recursive: true });
  }
  assert.ok(!planted.ran(), 'the planted hook ran');
  git(env, ['-C', dir, 'config', 'core.logallrefupdates', 'false']);
  assert.strictEqual(ok(await cli(env, ['save'], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(env, real), headOf(env, dir));
  assert.strictEqual(refs(env, planted.url), '');
});

test('removing a key set by hand is the way out, and remote does not bypass it', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box);
  git(env, ['-C', dir, 'config', 'remote.origin.url', box.bare('other.git')]);
  assert.match(failed(await cli(env, ['remote', '--palace', dir], { url: remote, private: true }), 'remote'), FOREIGN_KEY('remote.origin.url'));
  git(env, ['-C', dir, 'config', '--remove-section', 'remote.origin']);
  assert.strictEqual(recordedOf(env, dir), remote);
  assert.strictEqual(ok(await cli(env, ['save', '--palace', dir], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(env, remote), headOf(env, dir));
});

test('a palace whose machine record was lost does not sync until joined with its remote', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box);
  const pushed = mainOf(env, remote);
  fs.rmSync(machineFile(env));
  assert.strictEqual(ok(await cli(env, ['save', '--palace', dir], memoryOf(tag()))).synced, false);
  assert.strictEqual(mainOf(env, remote), pushed);
  assert.match(failed(await cli(env, ['join', '--palace', dir], { passphrase: null }), 'join without remote'), OWN_REPO);
  ok(await cli(env, ['join', '--palace', dir], { passphrase: null, remote }));
  assert.strictEqual(ok(await cli(env, ['save', '--palace', dir], memoryOf(tag()))).synced, true);
  assert.strictEqual(mainOf(env, remote), headOf(env, dir));
});

test('a .git or .git/config not owned by the current user is refused',{ skip: !process.getuid || process.getuid() === 0 }, async (t) => {
  const { env, dir, memory } = await plantedGit(t, () => '');
  const config = path.join(dir, '.git', 'config');
  fs.rmSync(config);
  fs.symlinkSync('/etc/passwd', config);
  assert.match(failed(await cli(env, ['recall'], { place: memory.place }), 'config'), /\.git[/\\]config is not owned by the current user/);
  fs.rmSync(path.join(dir, '.git'), { recursive: true });
  fs.symlinkSync('/', path.join(dir, '.git'));
  assert.match(failed(await cli(env, ['recall'], { place: memory.place }), '.git'), /\.git is not owned by the current user/);
});

test('palaces made by setup, join and remote pass the configuration check', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir, remote } = onlinePalace(box);
  const joined = box.at('joined');
  join(joined, { remote, passphrase: null }, { env });
  const later = box.at('later');
  setup(later, SETTINGS, { env });
  ok(await cli(env, ['remote', '--palace', later], { url: box.bare('later-remote.git'), private: true }));
  for (const palace of [dir, joined, later]) {
    assert.strictEqual(ok(await cli(env, ['status', '--palace', palace])).online, true, palace);
    assert.deepStrictEqual(linkKeys(env, palace), [], palace);
  }
});

test('inherited author and committer variables do not reach the commits', async (t) => {
  const box = sandbox(t);
  const env = { ...box.env };
  for (const role of ['AUTHOR', 'COMMITTER']) {
    Object.assign(env, { [`GIT_${role}_NAME`]: 'MKPLname', [`GIT_${role}_EMAIL`]: 'MKPLmail@example.invalid', [`GIT_${role}_DATE`]: '2001-01-01T00:00:00Z' });
  }
  const remote = box.bare('remote.git');
  ok(await cli(env, ['setup', '--palace', box.at('palace')], { ...SETTINGS, remote, private: true }));
  ok(await cli(env, ['save'], memoryOf(tag())));
  const log = git(box.env, ['--git-dir', remote, 'log', '--format=%an <%ae> %ad|%cn <%ce> %cd', '--date=format:%Y', 'main']).trim().split('\n');
  const year = String(new Date().getFullYear());
  for (const line of log) assert.strictEqual(line, `memory-palace <memory-palace@localhost> ${year}|memory-palace <memory-palace@localhost> ${year}`);
});

test('every git call runs with terminal prompts off', async (t) => {
  const box = sandbox(t);
  const bin = box.at('bin');
  const calls = box.at('git-calls');
  fs.mkdirSync(bin);
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  script(path.join(bin, 'git'), [
    'sub=; skip=',
    'for a in "$@"; do if [ -n "$skip" ]; then skip=; elif [ "$a" = -c ] || [ "$a" = -C ]; then skip=1; elif [ -z "$sub" ]; then sub=$a; fi; done',
    `echo "$sub \${GIT_TERMINAL_PROMPT-unset}" >> '${calls}'`,
    `exec '${real}' "$@"`,
  ].join('\n'));
  const env = { ...box.env, PATH: `${bin}${path.delimiter}${box.env.PATH}` };
  const remote = box.bare('remote.git');
  ok(await cli(env, ['setup', '--palace', box.at('palace')], { ...SETTINGS, remote, private: true }));
  ok(await cli(env, ['join', '--palace', box.at('joined')], { remote, passphrase: null }));
  ok(await cli(env, ['save', '--palace', box.at('joined')], memoryOf(tag())));
  const lines = readFile(calls).trim().split('\n');
  for (const sub of ['init', 'clone', 'ls-remote', 'push']) assert.ok(lines.some((line) => line.startsWith(`${sub} `)), `no ${sub} call was logged`);
  assert.deepStrictEqual(lines.filter((line) => !line.endsWith(' 0')), []);
});

test('a palace with a .git and no origin reports synced false', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const dir = box.at('palace');
  ok(await cli(env, ['setup', '--palace', dir], SETTINGS));
  git(env, ['init', '-q', '-b', 'main', dir]);
  assert.strictEqual(ok(await cli(env, ['save'], memoryOf(tag()))).synced, false);
});

test('setup and remote refuse a URL too long or holding a control character', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const { dir } = onlinePalace(box);
  const target = box.at('new');
  for (const url of [`${box.bare('remote.git')}\nMKPLctl8`, `ssh://example.invalid/${'x'.repeat(2048)}`]) {
    for (const [args, input] of [[['setup', '--palace', target], { ...SETTINGS, remote: url, private: true }], [['remote', '--palace', dir], { url, private: true }]]) {
      assert.match(failed(await cli(env, args, input), args[0]), /the remote URL must be at most 2048 characters with no control characters/);
      assert.ok(!fs.existsSync(target), `${args[0]}: ${target} exists`);
    }
  }
  ok(await cli(env, ['status', '--palace', dir]));
});
