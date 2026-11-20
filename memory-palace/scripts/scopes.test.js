'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { cli, envFor } = require('./test-support.js');

const IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid'];
const UNPROTECTED = { passphrase: null };
const memoryAt = (place, text) => ({ place, title: `Title of ${text}`, summary: `Summary of ${text}`, text, kind: 'fact' });

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-scopes-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = envFor(root);
  const record = path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
  return {
    root,
    env,
    record,
    keyFile: path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'key'),
    globalFolder: path.join(env.XDG_DATA_HOME, 'memory-palace', 'global'),
    sessionBase: path.join(env.XDG_RUNTIME_DIR, 'memory-palace'),
    sessionFolder: (id) => path.join(env.XDG_RUNTIME_DIR, 'memory-palace', 'sessions', id),
    projectFolder: (projectRoot) => path.join(env.XDG_DATA_HOME, 'memory-palace', 'projects',
      `${path.basename(projectRoot).slice(0, 40)}-${crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}`),
    machine: () => JSON.parse(fs.readFileSync(record, 'utf8')),
  };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function failed(result, what, code = 1) {
  assert.strictEqual(result.code, code, `${what}: exit ${result.code}: ${result.stdout}${result.stderr}`);
  return result.stderr.trim();
}

const git = (env, args) => execFileSync('git', [...IDENTITY, ...args], { env, timeout: 10000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function repository(env, dir) {
  git(env, ['init', '-q', '-b', 'main', dir]);
  fs.writeFileSync(path.join(dir, 'README'), 'project\n');
  git(env, ['-C', dir, 'add', 'README']);
  git(env, ['-C', dir, 'commit', '-q', '-m', 'first']);
  return dir;
}

const project = (box, name = 'proj') => repository(box.env, path.join(box.root, name));

test('355-2: setup --scope project in a repository creates the project palace and leaves the default alone', async (t) => {
  const box = sandbox(t);
  const { env, globalFolder } = box;
  ok(await cli(env, ['setup'], UNPROTECTED));
  const root = project(box);
  const palace = box.projectFolder(root);
  assert.deepStrictEqual(ok(await cli(env, ['setup', '--scope', 'project'], UNPROTECTED, { cwd: root })), { palace, scope: 'project', default: globalFolder });
  const machine = box.machine();
  assert.strictEqual(machine.default, globalFolder);
  assert.deepStrictEqual(machine.projects, { [root]: palace });
  assert.ok(fs.existsSync(path.join(palace, 'palace.json')));
});

test('355-3: a linked worktree finds the project palace of its main checkout', async (t) => {
  const box = sandbox(t);
  const { env, root: sandboxRoot } = box;
  const root = project(box);
  const worktree = path.join(sandboxRoot, 'linked');
  git(env, ['-C', root, 'worktree', 'add', '-q', worktree]);
  ok(await cli(env, ['setup', '--scope', 'project'], UNPROTECTED, { cwd: root }));
  ok(await cli(env, ['save', '--scope', 'project'], memoryAt('wing/room', 'from the main checkout'), { cwd: root }));
  const recalled = ok(await cli(env, ['recall', '--scope', 'project'], { place: 'wing/room' }, { cwd: worktree }));
  assert.strictEqual(recalled.text, 'from the main checkout');
  assert.strictEqual(recalled.scope, 'project');
});

test('355-4: inside a submodule the project root is the submodule checkout', async (t) => {
  const box = sandbox(t);
  const { env } = box;
  const sub = project(box, 'sub-origin');
  const parent = project(box, 'parent');
  git(env, ['-c', 'protocol.file.allow=always', '-C', parent, 'submodule', 'add', '-q', sub, 'mods/sub']);
  const deep = path.join(parent, 'mods', 'sub', 'deep', 'er');
  fs.mkdirSync(deep, { recursive: true });
  assert.strictEqual(ok(await cli(env, ['status'], '', { cwd: deep })).projectRoot, path.join(parent, 'mods', 'sub'));
});

test('355-5: outside a repository, or without git, the project root is the current folder', async (t) => {
  const box = sandbox(t);
  const { env, root: sandboxRoot } = box;
  const plain = path.join(sandboxRoot, 'plain', 'folder');
  fs.mkdirSync(plain, { recursive: true });
  const linked = path.join(sandboxRoot, 'link-to-plain');
  fs.symlinkSync(plain, linked);
  assert.strictEqual(ok(await cli(env, ['status'], '', { cwd: linked })).projectRoot, plain);
  const root = project(box);
  const inside = path.join(root, 'sub');
  fs.mkdirSync(inside);
  const noGit = path.join(sandboxRoot, 'no-git-bin');
  fs.mkdirSync(noGit);
  assert.strictEqual(ok(await cli({ ...env, PATH: noGit }, ['status'], '', { cwd: inside })).projectRoot, inside);
  assert.strictEqual(ok(await cli(env, ['status'], '', { cwd: inside })).projectRoot, root);
});

async function threeScopes(t) {
  const box = sandbox(t);
  const root = project(box);
  const env = { ...box.env, CLAUDE_CODE_SESSION_ID: 'session-one' };
  ok(await cli(env, ['setup'], UNPROTECTED));
  ok(await cli(env, ['setup', '--scope', 'project'], UNPROTECTED, { cwd: root }));
  const run = (args, input = '') => cli(env, args, input, { cwd: root });
  return { ...box, env, projectRoot: root, run };
}

test('355-11: a bare recall returns the narrowest scope and names the others in alsoIn', async (t) => {
  const { run } = await threeScopes(t);
  ok(await run(['save', '--scope', 'project'], memoryAt('shared/place', 'project text')));
  ok(await run(['save', '--scope', 'global'], memoryAt('shared/place', 'global text')));
  ok(await run(['save', '--scope', 'session'], memoryAt('shared/place', 'session text')));
  ok(await run(['save'], memoryAt('only/global', 'global only')));
  const all = ok(await run(['recall'], { place: 'shared/place' }));
  assert.strictEqual(all.text, 'session text');
  assert.strictEqual(all.scope, 'session');
  assert.deepStrictEqual(all.alsoIn, ['project', 'global']);
  const single = ok(await run(['recall'], { place: 'only/global' }));
  assert.strictEqual(single.scope, 'global');
  assert.ok(!Object.hasOwn(single, 'alsoIn'), JSON.stringify(single));
  assert.deepStrictEqual(ok(await run(['recall'], { place: 'nowhere/at-all' })), { found: false });
  assert.strictEqual(ok(await run(['recall', '--scope', 'global'], { place: 'shared/place' })).scope, 'global');
});

test('355-12: a bare browse returns every scope narrowest first; a bare list returns the sorted union', async (t) => {
  const { run } = await threeScopes(t);
  ok(await run(['save', '--scope', 'session'], memoryAt('omega/five', 's1')));
  ok(await run(['save', '--scope', 'project'], memoryAt('zeta/one', 'p1')));
  ok(await run(['save', '--scope', 'project'], memoryAt('beta/two', 'p2')));
  ok(await run(['save'], memoryAt('alpha/three', 'g1')));
  ok(await run(['save'], memoryAt('beta/four', 'g2')));
  const { memories } = ok(await run(['browse'], {}));
  assert.deepStrictEqual(memories.map(({ place, scope }) => [place, scope]), [
    ['omega/five', 'session'], ['beta/two', 'project'], ['zeta/one', 'project'], ['alpha/three', 'global'], ['beta/four', 'global'],
  ]);
  assert.deepStrictEqual(ok(await run(['list'], {})), { children: ['alpha', 'beta', 'omega', 'zeta'] });
});

test('355-13: an error in one scope stops a bare read, prefixed with its scope', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  ok(await cli(box.env, ['setup'], UNPROTECTED));
  ok(await cli(box.env, ['setup', '--scope', 'project'], {}, { cwd: root }));
  fs.rmSync(box.keyFile);
  const stderr = failed(await cli(box.env, ['recall'], { place: 'wing/room' }, { cwd: root }), 'bare recall');
  assert.ok(stderr.startsWith('project palace: no passphrase'), stderr);
  assert.ok(failed(await cli(box.env, ['recall', '--scope', 'project'], { place: 'wing/room' }, { cwd: root }), 'named recall').startsWith('no passphrase'));
});

test('355-13: with only a global palace, a bare read still prefixes its warning and a named read does not', async (t) => {
  const box = sandbox(t);
  const env = { ...box.env, GIT_ALLOW_PROTOCOL: 'file' };
  const remote = path.join(box.root, 'remote.git');
  git(env, ['init', '-q', '--bare', '-b', 'main', remote]);
  ok(await cli(env, ['setup'], { passphrase: null, remote, private: true }));
  ok(await cli(env, ['save'], memoryAt('wing/room', 'text')));
  fs.renameSync(remote, `${remote}.gone`);
  const bare = ok(await cli(env, ['recall'], { place: 'wing/room' }));
  assert.ok(bare.warning.startsWith('global palace: '), bare.warning);
  const named = ok(await cli(env, ['recall', '--scope', 'global'], { place: 'wing/room' }));
  assert.ok(!named.warning.includes('palace: '), named.warning);
  const missing = path.join(box.root, 'missing');
  fs.renameSync(box.globalFolder, missing);
  assert.ok(failed(await cli(env, ['recall'], { place: 'wing/room' }), 'moved global').startsWith('global palace: no palace at '));
  assert.ok(failed(await cli(env, ['recall', '--scope', 'global'], { place: 'wing/room' }), 'moved global named').startsWith('no palace at '));
});

test('355-14: a bare save goes to the global palace, and refuses without one; forget --scope project leaves global alone', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  const run = (args, input) => cli(box.env, args, input, { cwd: root });
  ok(await run(['setup', '--scope', 'project'], UNPROTECTED));
  assert.strictEqual(failed(await run(['save'], memoryAt('wing/room', 'x')), 'save without global'),
    'no global palace on this machine. Pass --scope project or --scope session, or set up a global palace.');
  ok(await run(['setup'], UNPROTECTED));
  ok(await run(['save'], memoryAt('wing/room', 'global text')));
  assert.deepStrictEqual(ok(await run(['recall', '--scope', 'project'], { place: 'wing/room' })), { found: false });
  ok(await run(['save', '--scope', 'project'], memoryAt('wing/room', 'project text')));
  assert.deepStrictEqual(ok(await run(['forget', '--scope', 'project'], { place: 'wing/room' })), { forgot: 'wing/room', found: true });
  const left = ok(await run(['recall'], { place: 'wing/room' }));
  assert.strictEqual(left.text, 'global text');
  assert.strictEqual(left.scope, 'global');
});

test('355-14: a named project scope that is not set up refuses', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  ok(await cli(box.env, ['setup'], UNPROTECTED));
  assert.strictEqual(failed(await cli(box.env, ['recall', '--scope', 'project'], { place: 'a/b' }, { cwd: root }), 'no project'),
    `no project palace for ${root}. Set one up with setup --scope project, or bind its folder with join --scope project.`);
});

test('355-15: --scope with --palace is a usage error except for setup and join', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  const dir = path.join(box.root, 'chosen');
  failed(await cli(box.env, ['save', '--scope', 'global', '--palace', dir], memoryAt('a/b', 'x')), 'save with both', 2);
  const result = ok(await cli(box.env, ['setup', '--scope', 'project', '--palace', dir], UNPROTECTED, { cwd: root }));
  assert.strictEqual(result.scope, 'project');
  assert.deepStrictEqual(box.machine().projects, { [root]: dir });
  assert.strictEqual(box.machine().default, null);
});

test('options: unknown, repeated or missing options and unknown scopes are usage errors', async (t) => {
  const { env } = sandbox(t);
  for (const args of [
    ['status', '--scope'], ['status', '--scope', 'galaxy'], ['status', '--scope', 'Session'], ['status', '--palace'],
    ['status', '--scope', 'global', '--scope', 'project'], ['status', '--palace', 'a', '--palace', 'b'], ['status', '--where', 'x'],
  ]) {
    failed(await cli(env, args), args.join(' '), 2);
  }
});

test('355-17: a v1 machine record and v1 palace answer bare save and recall as the global scope', async (t) => {
  const box = sandbox(t);
  const dir = path.join(box.root, 'v1-palace');
  ok(await cli(box.env, ['setup', '--palace', dir], { backend: 'folder', passphrase: null, kinds: ['fact'], moments: ['on-request'] }));
  fs.writeFileSync(box.record, JSON.stringify({ default: dir, palaces: { [dir]: { passphrase: null, protected: false, origin: null } } }));
  ok(await cli(box.env, ['save'], memoryAt('wing/room', 'v1 text')));
  const recalled = ok(await cli(box.env, ['recall'], { place: 'wing/room' }));
  assert.strictEqual(recalled.text, 'v1 text');
  assert.strictEqual(recalled.scope, 'global');
});

test('355-18: a bare status reports each scope, the project root and the recorded passphrase source', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  const env = { ...box.env, CLAUDE_CODE_SESSION_ID: 'session-one' };
  const run = (args, input = '') => cli(env, args, input, { cwd: root });
  const empty = ok(await run(['status']));
  assert.deepStrictEqual(empty.scopes, { global: null, project: null, session: null });
  assert.deepStrictEqual(ok(await run(['status', '--scope', 'session'])), { palace: null });
  assert.strictEqual(empty.projectRoot, root);
  assert.strictEqual(empty.proposed.scope, 'global');
  const unset = ok(await run(['status', '--scope', 'project']));
  assert.strictEqual(unset.palace, null);
  assert.deepStrictEqual(unset.proposed.scope, 'project');
  assert.deepStrictEqual(unset.proposed.palace, box.projectFolder(root));
  ok(await run(['setup'], {}));
  ok(await run(['setup', '--scope', 'project'], UNPROTECTED));
  const both = ok(await run(['status']));
  assert.ok(!Object.hasOwn(both, 'proposed'));
  assert.strictEqual(both.scopes.global.palace, box.globalFolder);
  assert.deepStrictEqual(both.scopes.global.passphrase, { file: box.keyFile });
  assert.strictEqual(both.scopes.project.palace, box.projectFolder(root));
  assert.strictEqual(both.scopes.project.passphrase, null);
  assert.deepStrictEqual(ok(await run(['status', '--scope', 'global'])).passphrase, { file: box.keyFile });
  assert.strictEqual(both.scopes.session, null);
  ok(await run(['save', '--scope', 'session'], memoryAt('wing/room', 'session text')));
  const session = ok(await run(['status'])).scopes.session;
  assert.strictEqual(session.palace, box.sessionFolder('session-one'));
  assert.strictEqual(session.passphrase, null);
  assert.strictEqual(ok(await run(['status', '--scope', 'session'])).palace, box.sessionFolder('session-one'));
});

test('355-19: a moved project is bound again with join --scope project and the source status reports', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  ok(await cli(box.env, ['setup'], UNPROTECTED));
  const { palace } = ok(await cli(box.env, ['setup', '--scope', 'project'], {}, { cwd: root }));
  ok(await cli(box.env, ['save', '--scope', 'project'], memoryAt('wing/room', 'project memory'), { cwd: root }));
  const { passphrase } = ok(await cli(box.env, ['status', '--palace', palace]));
  const moved = path.join(box.root, 'moved');
  fs.renameSync(root, moved);
  const run = (args, input) => cli(box.env, args, input, { cwd: moved });
  assert.deepStrictEqual(ok(await run(['recall'], { place: 'wing/room' })), { found: false });
  assert.deepStrictEqual(ok(await run(['join', '--scope', 'project', '--palace', palace], { passphrase })), { joined: palace, scope: 'project', default: box.globalFolder });
  const found = ok(await run(['recall'], { place: 'wing/room' }));
  assert.strictEqual(found.text, 'project memory');
  assert.strictEqual(found.scope, 'project');
});

test('one folder bound to two scopes is read once, as the narrower scope', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  const run = (args, input) => cli(box.env, args, input, { cwd: root });
  ok(await run(['setup'], UNPROTECTED));
  ok(await run(['join', '--scope', 'project', '--palace', box.globalFolder], UNPROTECTED));
  ok(await run(['save'], memoryAt('wing/room', 'once')));
  assert.deepStrictEqual(ok(await run(['browse'], {})).memories.map(({ place, scope }) => [place, scope]), [['wing/room', 'project']]);
  const recalled = ok(await run(['recall'], { place: 'wing/room' }));
  assert.strictEqual(recalled.scope, 'project');
  assert.ok(!Object.hasOwn(recalled, 'alsoIn'), JSON.stringify(recalled));
  assert.deepStrictEqual(ok(await run(['list'], {})), { children: ['wing'] });
});

test('359-4: a project setup reuses the machine key file unchanged and repeats the note', async (t) => {
  const box = sandbox(t);
  const root = project(box);
  ok(await cli(box.env, ['setup'], {}));
  const bytes = fs.readFileSync(box.keyFile);
  assert.deepStrictEqual(ok(await cli(box.env, ['status', '--scope', 'project'], '', { cwd: root })).proposed.passphrase, { file: box.keyFile, create: false });
  const result = ok(await cli(box.env, ['setup', '--scope', 'project'], {}, { cwd: root }));
  assert.strictEqual(result.keyFile, box.keyFile);
  assert.match(result.note, /^This palace is encrypted with the key in /);
  assert.deepStrictEqual(fs.readFileSync(box.keyFile), bytes);
  for (const scope of ['global', 'project']) {
    ok(await cli(box.env, ['save', '--scope', scope], memoryAt('wing/room', scope), { cwd: root }));
    assert.strictEqual(ok(await cli(box.env, ['recall', '--scope', scope], { place: 'wing/room' }, { cwd: root })).text, scope);
  }
});

const withSession = (env, id) => ({ ...env, CLAUDE_CODE_SESSION_ID: id });
const modeOf = (dir) => fs.statSync(dir).mode & 0o777;
const NOT_PRIVATE = ' is not a private folder of the current user (it is a link, owned by another user, or open to others). Nothing was changed.';

test('355-6: the first session save creates a private, unprotected session palace and leaves the machine record alone', async (t) => {
  const box = sandbox(t);
  ok(await cli(box.env, ['setup'], UNPROTECTED));
  const record = fs.readFileSync(box.record);
  const env = withSession(box.env, 'abc-1');
  assert.deepStrictEqual(ok(await cli(env, ['save', '--scope', 'session'], memoryAt('wing/room', 'session text'))), { saved: 'wing/room', replaced: false, synced: false });
  const dir = box.sessionFolder('abc-1');
  for (const folder of [box.sessionBase, path.dirname(dir), dir]) assert.strictEqual(modeOf(folder), 0o700, folder);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'palace.json'), 'utf8'));
  assert.strictEqual(settings.protected, false);
  assert.deepStrictEqual(settings.moments, ['on-request']);
  assert.strictEqual(settings.privateRemote, null);
  assert.ok(!fs.existsSync(path.join(dir, '.git')));
  assert.deepStrictEqual(fs.readFileSync(box.record), record);
  assert.strictEqual(ok(await cli(env, ['recall', '--scope', 'session'], { place: 'wing/room' })).text, 'session text');

  const { XDG_RUNTIME_DIR: _, ...noRuntime } = withSession(box.env, 'abc-2');
  ok(await cli(noRuntime, ['save', '--scope', 'session'], memoryAt('wing/room', 'tmp text')));
  const fallback = path.join(box.env.TMPDIR, `memory-palace-${os.userInfo().username}`, 'sessions', 'abc-2');
  assert.ok(fs.existsSync(path.join(fallback, 'palace.json')), fallback);
  assert.strictEqual(modeOf(fallback), 0o700);
  assert.deepStrictEqual(fs.readFileSync(box.record), record);
});

test('355-7: a session palace has no setup or join, and a session read before any save refuses', async (t) => {
  const box = sandbox(t);
  const env = withSession(box.env, 'abc');
  for (const command of ['setup', 'join']) {
    assert.strictEqual(failed(await cli(env, [command, '--scope', 'session'], UNPROTECTED), command, 2), 'a session palace needs no setup: save with --scope session');
  }
  assert.strictEqual(failed(await cli(env, ['recall', '--scope', 'session'], { place: 'a/b' }), 'recall'), 'this session has saved no session memories. Nothing was changed.');
  assert.ok(!fs.existsSync(box.sessionBase));
});

test('355-8: the session scope without a valid session id refuses and writes nothing; a bare recall answers from global', async (t) => {
  const box = sandbox(t);
  ok(await cli(box.env, ['setup'], UNPROTECTED));
  ok(await cli(box.env, ['save'], memoryAt('wing/room', 'global text')));
  const cases = [
    [box.env, 'the session scope needs a session id, and CLAUDE_CODE_SESSION_ID is not set. Use --scope project or --scope global.'],
    [withSession(box.env, '../x'), 'the session scope needs a session id, and CLAUDE_CODE_SESSION_ID is not a valid session id. Use --scope project or --scope global.'],
  ];
  for (const [env, text] of cases) {
    assert.strictEqual(failed(await cli(env, ['save', '--scope', 'session'], memoryAt('wing/room', 'x')), text), text);
    assert.ok(!fs.existsSync(env.XDG_RUNTIME_DIR), env.CLAUDE_CODE_SESSION_ID);
    const bare = ok(await cli(env, ['recall'], { place: 'wing/room' }));
    assert.strictEqual(bare.scope, 'global');
    assert.ok(!Object.hasOwn(bare, 'warning'), JSON.stringify(bare));
  }
});

test('355-9: a session folder that is a link or open to others is refused, naming it', { skip: process.platform === 'win32' }, async (t) => {
  const box = sandbox(t);
  const env = withSession(box.env, 'first');
  ok(await cli(env, ['save', '--scope', 'session'], memoryAt('wing/room', 'x')));
  const elsewhere = path.join(box.root, 'elsewhere');
  fs.mkdirSync(elsewhere, { mode: 0o700 });
  fs.symlinkSync(elsewhere, box.sessionFolder('linked'));
  assert.strictEqual(failed(await cli(withSession(box.env, 'linked'), ['save', '--scope', 'session'], memoryAt('wing/room', 'x')), 'link'),
    `${box.sessionFolder('linked')}${NOT_PRIVATE}`);
  assert.deepStrictEqual(fs.readdirSync(elsewhere), []);
  const sessions = path.dirname(box.sessionFolder('first'));
  for (const [folder, mode] of [[sessions, 0o755], [box.sessionBase, 0o750]]) {
    fs.chmodSync(folder, mode);
    assert.strictEqual(failed(await cli(env, ['recall', '--scope', 'session'], { place: 'wing/room' }), folder), `${folder}${NOT_PRIVATE}`);
    fs.chmodSync(folder, 0o700);
  }
});

test('355-10: two session ids give two palaces', async (t) => {
  const box = sandbox(t);
  const one = withSession(box.env, 'one');
  const two = withSession(box.env, 'two');
  ok(await cli(one, ['save', '--scope', 'session'], memoryAt('wing/room', 'one text')));
  ok(await cli(two, ['save', '--scope', 'session'], memoryAt('other/room', 'two text')));
  assert.deepStrictEqual(ok(await cli(two, ['recall', '--scope', 'session'], { place: 'wing/room' })), { found: false });
  assert.deepStrictEqual(ok(await cli(two, ['recall'], { place: 'wing/room' })), { found: false });
  assert.strictEqual(ok(await cli(one, ['recall'], { place: 'wing/room' })).scope, 'session');
});

test('355-16: a session palace has no remote', async (t) => {
  const box = sandbox(t);
  const env = withSession(box.env, 'abc');
  ok(await cli(env, ['save', '--scope', 'session'], memoryAt('wing/room', 'x')));
  assert.strictEqual(failed(await cli(env, ['remote', '--scope', 'session'], { url: path.join(box.root, 'remote.git') }), 'remote'),
    'a session palace has no remote. Nothing was changed.');
  assert.ok(!fs.existsSync(path.join(box.sessionFolder('abc'), '.git')));
});

async function brokenSession(t, breakIt, statusSees = true) {
  const box = sandbox(t);
  const env = withSession(box.env, 'abc');
  ok(await cli(env, ['setup'], UNPROTECTED));
  ok(await cli(env, ['save'], memoryAt('wing/room', 'global text')));
  ok(await cli(env, ['save', '--scope', 'session'], memoryAt('wing/room', 'session text')));
  breakIt(box);
  const recalled = ok(await cli(env, ['recall'], { place: 'wing/room' }));
  assert.strictEqual(recalled.text, 'global text');
  assert.strictEqual(recalled.scope, 'global');
  assert.ok(recalled.warning.startsWith('session palace: '), recalled.warning);
  failed(await cli(env, ['recall', '--scope', 'session'], { place: 'wing/room' }), 'named session recall');
  const status = ok(await cli(env, ['status']));
  assert.strictEqual(status.scopes.global.palace, box.globalFolder);
  if (!statusSees) return;
  assert.strictEqual(status.scopes.session, null);
  assert.ok(status.warning.startsWith('session palace: '), status.warning);
  failed(await cli(env, ['status', '--scope', 'session']), 'named session status');
}

test('355-20: a session folder open to others is a warning on a bare read and status', { skip: process.platform === 'win32' }, async (t) => {
  await brokenSession(t, (box) => fs.chmodSync(path.dirname(box.sessionFolder('abc')), 0o755));
});

test('355-20: a damaged session palace.json is a warning on a bare read and status', async (t) => {
  await brokenSession(t, (box) => fs.truncateSync(path.join(box.sessionFolder('abc'), 'palace.json'), 3));
});

test('355-20: a session meta file cut short is a warning on a bare read; status does not read it', async (t) => {
  await brokenSession(t, (box) => fs.truncateSync(path.join(box.sessionFolder('abc'), 'meta'), 3), false);
});

test('two first session saves at once both land in one session palace', async (t) => {
  const box = sandbox(t);
  const env = withSession(box.env, 'raced');
  const results = await Promise.all(['one', 'two', 'three'].map((name) => cli(env, ['save', '--scope', 'session'], memoryAt(`race/${name}`, name))));
  results.forEach((result) => ok(result));
  assert.deepStrictEqual(ok(await cli(env, ['list', '--scope', 'session'], { place: 'race' })).children.sort(), ['one', 'three', 'two']);
});
