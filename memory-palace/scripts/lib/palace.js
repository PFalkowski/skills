'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, UsageError, parseJson } = require('./errors.js');
const { LIMITS, CONTROL, parsePlace, showPlace, rangeOf, childPrefix, checkLimits } = require('./place.js');
const { createTree } = require('./tree.js');
const { folderStore, pageId, checkId } = require('./stores.js');
const lock = require('./lock.js');
const seal = require('./seal.js');
const git = require('./git.js');
const { configDir, machineKeyFile, defaultFolder, projectRoot, sessionId, sessionFolder } = require('./scopes.js');

const FORMAT = 1;
const LOCK_WAIT_MS = 60000;
const TREE = { m: 128, L: 32 };
const TREE_MOST = 1024;
const MOST_KINDS = 32;
const MOST_URL = 2048;
const MOMENTS = ['on-request', 'after-decision', 'end-of-task'];
const DEFAULT_KINDS = ['decision', 'preference', 'fact', 'lesson'];
const GITIGNORE = 'lock\n*.tmp\npending.*\n';
const WRITES = new Set(['save', 'forget', 'sync', 'remote', 'check']);
const READS = new Set(['recall', 'browse', 'list']);
const SCOPES = ['project', 'global'];
const SHORT_GIT_MS = 20000;
const LONG_GIT_MS = 120000;
const META = 'meta';
const DEFAULT_N = 2 ** 17;

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

const machineFile = (env) => path.join(configDir(env), 'config.json');

const label = (id) => (id === META ? 'the meta page' : `page ${id}`);
const aad = (id) => `memory-palace/1/${id}`;

function codecFor(keys) {
  const parse = (id, plain) => parseJson(Buffer.from(plain).toString('utf8'), label(id));
  if (keys === null) return { encode: (id, page) => Buffer.from(JSON.stringify(page)), decode: parse };
  return {
    encode: (id, page) => seal.seal(keys, aad(id), Buffer.from(JSON.stringify(page))),
    decode: (id, bytes) => {
      let plain;
      try {
        plain = seal.open(keys, aad(id), bytes);
      } catch {
        throw new PalaceError(`${label(id)} is damaged or altered: it failed its integrity check. Nothing was changed.`);
      }
      return parse(id, plain);
    },
  };
}

const validKdf = (kdf) =>
  kdf?.name === 'scrypt' && Number.isInteger(kdf.N) && kdf.N >= 2 ** 14 && kdf.N <= 2 ** 20 && (kdf.N & (kdf.N - 1)) === 0 &&
  kdf.r === 8 && kdf.p === 1 && typeof kdf.salt === 'string';

const isInside = (file, dir) => file === dir || file.startsWith(`${dir}${path.sep}`);

function realKeyFile(file) {
  try {
    return fs.realpathSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') throw new PalaceError(`no passphrase: the key file ${file} does not exist.`);
    throw err;
  }
}

function refuseInside(file, real, palace) {
  if (isInside(real, palace)) {
    throw new PalaceError(`the key file ${file} is inside the palace folder ${palace}. Keep it outside the palace. Nothing was changed.`);
  }
}

function keyFileOutside(file, palace) {
  const real = realKeyFile(file);
  refuseInside(file, real, palace);
  if (process.platform !== 'win32' && (fs.statSync(real).mode & 0o077) !== 0) {
    throw new PalaceError(`the key file ${file} is open to other users, so they can read the passphrase. Run chmod 600 on it. Nothing was changed.`);
  }
  return real;
}

function readPassphrase(source, env, palace) {
  let text;
  if (source.env !== undefined) {
    text = env[source.env];
    if (text === undefined) throw new PalaceError(`no passphrase: the environment variable ${source.env} is not set.`);
  } else {
    text = fs.readFileSync(keyFileOutside(source.file, palace), 'utf8');
  }
  return text.replace(/\r?\n$/, '').normalize('NFC');
}

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const sortedKeys = (key, value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]])) : value);

function checkOf(keys, settings) {
  const { check: _, ...bound } = settings;
  return seal.checkValue(keys, JSON.stringify(bound, sortedKeys)).toString('hex');
}

const withCheck = (settings, keys) => (keys ? { ...settings, check: checkOf(keys, settings) } : settings);

function checkBound(settings, keys, file) {
  if (!same(Buffer.from(settings.check), Buffer.from(checkOf(keys, settings)))) {
    throw new PalaceError(`the settings in ${file} were altered without the passphrase: they do not match its check value. Nothing was changed.`);
  }
}

function unlockKeys(settings, entry, env, palace) {
  if (!entry?.passphrase) throw new PalaceError(`no passphrase: ${palace} is protected, and ${machineFile(env)} records no passphrase source for it.`);
  const keys = seal.deriveKeys(readPassphrase(entry.passphrase, env, palace), settings.kdf);
  const proof = seal.passphraseCheck(keys);
  if (!same(Buffer.from(settings.check, 'hex').subarray(0, proof.length), proof)) {
    throw new PalaceError(`wrong passphrase: it does not open ${palace}. Nothing was changed.`);
  }
  checkBound(settings, keys, path.join(palace, 'palace.json'));
  return keys;
}

function readMachine(env) {
  const file = machineFile(env);
  const parsed = fs.existsSync(file) ? parseJson(fs.readFileSync(file, 'utf8'), file) : {};
  return { default: null, palaces: {}, projects: {}, ...parsed };
}

function writeReplacing(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

function boundFolder(scope, ctx, machine) {
  if (scope === 'global') return { dir: machine.default };
  if (ctx.cwd === null && ctx.scope === undefined) return { root: null, dir: null };
  const root = projectRoot(ctx.env, ctx.cwd);
  return { root, dir: machine.projects[root] ?? null };
}

function boundFolders(ctx, machine) {
  const project = boundFolder('project', ctx, machine);
  return { projectRoot: project.root, global: machine.default, project: project.dir };
}

function sessionTarget(ctx, command) {
  if (command === 'remote') throw new PalaceError('a session palace has no remote. Nothing was changed.');
  const dir = sessionFolder(ctx.env, command === 'save');
  if (dir === null) throw new PalaceError('this session has saved no session memories. Nothing was changed.');
  if (command === 'save' && !fs.existsSync(path.join(dir, 'palace.json'))) createSession(dir, ctx);
  return dir;
}

function target(ctx, command) {
  if (ctx.palace !== undefined) return path.resolve(ctx.palace);
  if (ctx.scope === 'session') return sessionTarget(ctx, command);
  const { root, dir } = boundFolder(ctx.scope ?? 'global', ctx, readMachine(ctx.env));
  if (dir) return dir;
  if (root === undefined) throw new PalaceError('no global palace on this machine. Pass --scope project or --scope session, or set up a global palace.');
  throw new PalaceError(`no project palace for ${root}. Set one up with setup --scope project, or bind its folder with join --scope project.`);
}

function scopeOf(dir, ctx) {
  const bound = boundFolders(ctx, readMachine(ctx.env));
  const real = fs.realpathSync(dir);
  return SCOPES.find((scope) => bound[scope] === real) ?? null;
}

const inScope = (scope, message) => `${scope} palace: ${message}`;

function fromSession(ctx, work) {
  if (sessionId(ctx.env) === null) return {};
  try {
    const dir = sessionFolder(ctx.env, false);
    return dir ? { value: work(dir) } : {};
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    return { warning: inScope('session', err.message) };
  }
}

function prefixingErrors(scope, work) {
  try {
    return work();
  } catch (err) {
    if (err instanceof PalaceError) throw new PalaceError(inScope(scope, err.message));
    throw err;
  }
}

const sqliteRefusal = (dir) =>
  `${dir} is a SQLite palace, which this version no longer reads. Its memories are safe in ${path.join(dir, 'palace.db')}; nothing was changed. To move them to a folder palace: get the v1 scripts (git clone https://github.com/PFalkowski/skills skills-v1 and git -C skills-v1 checkout f7a6691), run node skills-v1/memory-palace/scripts/palace.js browse --palace ${dir} and recall each place with a Node version that has the built-in SQLite module, and save each memory into a new palace with this version. Keep palace.db until the new palace holds everything.`;

function readSettings(dir) {
  const file = path.join(dir, 'palace.json');
  if (!fs.existsSync(file)) throw new PalaceError(`no palace at ${dir}: ${file} is missing`);
  const text = fs.readFileSync(file, 'utf8');
  if (parseJson(text, file).backend === 'sqlite') throw new PalaceError(sqliteRefusal(dir));
  return parseSettings(text, file);
}

const isIntIn = (n, least, most) => Number.isInteger(n) && n >= least && n <= most;
const plainKind = (kind) => typeof kind === 'string' && kind.length > 0 && kind.length <= LIMITS.kind && !CONTROL.test(kind);
const plainUrl = (url) => typeof url === 'string' && url.length <= MOST_URL && !CONTROL.test(url);

function badLists({ kinds, moments }) {
  if (!Array.isArray(kinds) || kinds.length > MOST_KINDS || !kinds.every(plainKind)) {
    return `kinds must be a list of at most ${MOST_KINDS} kinds, each 1 to ${LIMITS.kind} characters with no control characters`;
  }
  if (!Array.isArray(moments) || !moments.every((moment) => MOMENTS.includes(moment))) return `moments must be a list drawn from ${MOMENTS.join(', ')}`;
  return undefined;
}

function parseSettings(text, file) {
  const settings = parseJson(text, file);
  if (settings.format !== FORMAT) {
    const shown = isIntIn(settings.format, 0, 999) ? `format ${settings.format}` : 'an unknown format';
    throw new PalaceError(`${file} has ${shown}; this version reads format ${FORMAT} only. Nothing was changed.`);
  }
  if (settings.backend !== 'folder') {
    throw new PalaceError(`${file} has an unknown backend; this version reads "folder" only. Nothing was changed.`);
  }
  if (!isIntIn(settings.tree?.m, 3, TREE_MOST) || !isIntIn(settings.tree?.L, 1, TREE_MOST)) {
    throw new PalaceError(`${file} has tree sizes outside m 3 to ${TREE_MOST} and L 1 to ${TREE_MOST}. Nothing was changed.`);
  }
  const bad = badLists(settings);
  if (bad) throw new PalaceError(`${file}: ${bad}. Nothing was changed.`);
  if (settings.privateRemote !== null && !plainUrl(settings.privateRemote)) {
    throw new PalaceError(`${file} has a privateRemote that is neither null nor a URL of at most ${MOST_URL} characters with no control characters. Nothing was changed.`);
  }
  if (settings.protected && !validKdf(settings.kdf)) {
    throw new PalaceError(`${file} has scrypt parameters outside N 2^14 to 2^20, r 8, p 1. Nothing was changed.`);
  }
  if (settings.protected && typeof settings.check !== 'string') {
    throw new PalaceError(`${file} is marked protected but has no check value. Nothing was changed.`);
  }
  return settings;
}

function requireStrings(input, fields) {
  for (const field of fields) {
    if (typeof input[field] !== 'string') throw new PalaceError(`${field} must be a string`);
  }
}

function optionalKey(input) {
  if (input.place === undefined) return null;
  requireStrings(input, ['place']);
  return parsePlace(input.place);
}

function proposal(scope, env, root) {
  const file = machineKeyFile(env);
  return { scope, palace: defaultFolder(scope, env, root), passphrase: { file, create: !fs.existsSync(file) }, remote: null, kinds: DEFAULT_KINDS, moments: MOMENTS };
}

function palaceStatus(dir, machine, env) {
  const settings = readSettings(dir);
  const { backend, kinds, moments, privateRemote } = settings;
  const online = git.online(env, dir);
  const entry = machine.palaces[fs.realpathSync(dir)];
  const remote = online ? recordedOrigin(entry) : null;
  return { palace: dir, backend, protected: settings.protected, online, remote, privateRemote, kinds, moments, passphrase: entry?.passphrase ?? null };
}

function status(ctx) {
  const machine = readMachine(ctx.env);
  if (ctx.palace !== undefined) return palaceStatus(path.resolve(ctx.palace), machine, ctx.env);
  if (ctx.scope === 'session') {
    const dir = sessionFolder(ctx.env, false);
    return dir ? palaceStatus(dir, machine, ctx.env) : { palace: null };
  }
  if (ctx.scope !== undefined) {
    const { root, dir } = boundFolder(ctx.scope, ctx, machine);
    return dir ? palaceStatus(dir, machine, ctx.env) : { palace: null, proposed: proposal(ctx.scope, ctx.env, root) };
  }
  const bound = boundFolders(ctx, machine);
  const scopes = {};
  for (const scope of ['global', 'project']) {
    scopes[scope] = bound[scope] ? prefixingErrors(scope, () => palaceStatus(bound[scope], machine, ctx.env)) : null;
  }
  const session = fromSession(ctx, (dir) => palaceStatus(dir, machine, ctx.env));
  scopes.session = session.value ?? null;
  const result = { scopes, projectRoot: bound.projectRoot, ...(session.warning && { warning: session.warning }) };
  return scopes.global || scopes.project ? result : { ...result, proposed: proposal('global', ctx.env) };
}

function checkSource(source) {
  const valid = source === null || (Object.keys(source ?? {}).length === 1 && (typeof source.env === 'string' || typeof source.file === 'string'));
  if (!valid) throw new PalaceError('passphrase must be null, {"env": "<variable name>"} or {"file": "<key file path>"}. Nothing was written.');
}

function checkUrl(url) {
  if (typeof url !== 'string' || url === '') throw new PalaceError('the remote URL must be a non-empty string. Nothing was written.');
  if (!plainUrl(url)) throw new PalaceError(`the remote URL must be at most ${MOST_URL} characters with no control characters. Nothing was written.`);
  if (git.carriesSecret(url)) throw new PalaceError(git.SECRET_URL);
}

function recordedOrigin(entry) {
  const origin = entry?.origin ?? null;
  if (origin !== null) checkUrl(origin);
  return origin;
}

function kdfOf(options) {
  const kdf = { name: 'scrypt', N: options.kdf?.N ?? DEFAULT_N, r: 8, p: 1, salt: crypto.randomBytes(16).toString('base64') };
  if (!validKdf(kdf)) throw new PalaceError('kdf.N must be a power of two from 16384 (2^14) to 1048576 (2^20). Nothing was written.');
  return kdf;
}

function protect(kdf, source, env, palace) {
  const passphrase = readPassphrase(source, env, palace);
  if (passphrase === '') throw new PalaceError('the passphrase is empty. Nothing was written.');
  return { kdf, keys: seal.deriveKeys(passphrase, kdf) };
}

function checkRepo(target, protectedPalace, env) {
  const repo = git.enclosingRepo(target, env);
  if (!repo || repo.allIgnored) return undefined;
  if (!protectedPalace) {
    throw new PalaceError(`${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this unprotected palace's memories in clear. Ignore the folder in ${repo.top}, choose a folder outside it, or turn on protection. Nothing was written.`);
  }
  return `${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this palace's sealed files.`;
}

const gitTimeout = (ctx, long) => ctx.gitTimeoutMs ?? (long ? LONG_GIT_MS : SHORT_GIT_MS);

function checkEmpty(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new PalaceError(`${dir} is not empty. Nothing was written.`);
}

const keyNote = (file) => `This palace is encrypted with the key in ${file}. Back up that file now, somewhere private and off this machine, such as a password manager. Losing it loses every memory in this palace: nothing else can open it. To use this palace on another machine, copy the file there and give \`join\` its path.`;

function createKeyFile(file, ctx) {
  const real = realPath(file);
  const repo = git.enclosingRepo(real, ctx.env, [real]);
  if (repo && !repo.allIgnored) {
    throw new PalaceError(`${file} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take the key. Ignore it there, or pass a passphrase source. Nothing was written.`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = path.join(path.dirname(file), `.key-${randomHex(8)}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeSync(fd, `${crypto.randomBytes(32).toString('base64url')}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    ctx.beforeKeyLink?.();
    fs.linkSync(temp, file);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function checkSetup(dir, real, options, ctx) {
  if (options.passphrase !== undefined) checkSource(options.passphrase);
  const keyFile = options.passphrase === undefined ? machineKeyFile(ctx.env) : undefined;
  if (keyFile) refuseInside(keyFile, realPath(keyFile), real);
  if (options.passphrase?.file !== undefined) keyFileOutside(options.passphrase.file, real);
  checkEmpty(dir);
  if (options.backend === 'sqlite') throw new UsageError('v2 has only the folder backend. Nothing was written.');
  if (![undefined, 'folder'].includes(options.backend)) throw new PalaceError('backend must be "folder" or left out. Nothing was written.');
  if (options.remote !== null) checkUrl(options.remote);
  const bad = badLists(options);
  if (bad) throw new PalaceError(`${bad}. Nothing was written.`);
  const protectedPalace = options.passphrase !== null;
  const kdf = protectedPalace ? kdfOf(options) : null;
  let warning;
  if (options.remote === null) warning = checkRepo(real, protectedPalace, ctx.env);
  else git.checkRemote(ctx.env, null, options.remote, gitTimeout(ctx, true));
  if (keyFile && !fs.existsSync(keyFile)) createKeyFile(keyFile, ctx);
  const source = keyFile ? { file: keyFile } : options.passphrase;
  const protection = protectedPalace ? protect(kdf, source, ctx.env, real) : null;
  return { protection, warning, keyFile, source };
}

function realPath(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  return path.join(realPath(path.dirname(file)), path.basename(file));
}

function realTarget(dir, isDefault) {
  const parent = path.dirname(dir);
  if (!isDefault && !fs.existsSync(parent)) throw new PalaceError(`the parent folder ${parent} does not exist. Create it first. Nothing was written.`);
  return realPath(dir);
}

const writeMachine = (env, machine) => writeReplacing(machineFile(env), `${JSON.stringify(machine, null, 2)}\n`);

function bind(env, scope, palace, entry, root) {
  const machine = readMachine(env);
  machine.palaces[palace] = entry;
  if (scope === 'global') machine.default = palace;
  if (scope === 'project') machine.projects[root] = palace;
  writeMachine(env, machine);
  return machine.default;
}

function recordOrigin(env, palace, origin) {
  const machine = readMachine(env);
  machine.palaces[palace] = { ...machine.palaces[palace], origin };
  writeMachine(env, machine);
}

function buildBeside(dir, build) {
  fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
  const temp = path.join(path.dirname(dir), `.${path.basename(dir)}.setup-${randomHex(8)}`);
  try {
    build(temp);
    fs.renameSync(temp, dir);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw err;
  }
  return fs.realpathSync(dir);
}

const writeSettings = (dir, settings) => writeReplacing(path.join(dir, 'palace.json'), `${JSON.stringify(settings, null, 2)}\n`);

function build(dir, isDefault, options, ctx) {
  const checked = checkSetup(dir, realTarget(dir, isDefault), options, ctx);
  const { protection } = checked;
  const codec = codecFor(protection?.keys ?? null);
  const palace = buildBeside(dir, (temp) => {
    fs.mkdirSync(temp, { mode: 0o700 });
    writeSettings(temp, withCheck({
      format: FORMAT, backend: 'folder', protected: Boolean(protection), kdf: protection?.kdf ?? null, check: null,
      tree: TREE, kinds: options.kinds, moments: options.moments, privateRemote: options.private === true ? options.remote : null,
    }, protection?.keys));
    fs.writeFileSync(path.join(temp, '.gitignore'), GITIGNORE);
    const store = folderStore(temp);
    store.lock({ write: true, waitMs: LOCK_WAIT_MS, command: 'setup' });
    try {
      const seed = randomHex(16);
      const root = pageId(seed, 0);
      store.begin(seed);
      store.put(root, codec.encode(root, { t: 'l', k: [], v: [] }));
      store.setMeta(codec.encode(META, { root, seed, free: [] }));
      store.end();
    } finally {
      store.release();
      store.close();
    }
    if (options.remote === null) return;
    git.init(ctx.env, temp);
    git.commit(ctx.env, temp);
  });
  return { ...checked, palace };
}

function createSession(dir, ctx) {
  try {
    build(dir, true, { passphrase: null, remote: null, kinds: DEFAULT_KINDS, moments: ['on-request'] }, ctx);
  } catch (err) {
    if (!fs.existsSync(path.join(dir, 'palace.json'))) throw err;
  }
}

function setup(target, input, ctx) {
  const scope = ctx.scope ?? 'global';
  const root = scope === 'project' ? projectRoot(ctx.env, ctx.cwd) : undefined;
  const options = { kinds: DEFAULT_KINDS, moments: MOMENTS, ...input, remote: input.remote ?? null };
  const dir = path.resolve(target ?? defaultFolder(scope, ctx.env, root));
  const { palace, protection, warning, keyFile, source } = build(dir, target === undefined, options, ctx);
  const machineDefault = bind(ctx.env, scope, palace, { passphrase: source, protected: Boolean(protection), origin: options.remote }, root);
  const result = { palace, scope, default: machineDefault, ...(warning && { warning }), ...(keyFile && { keyFile, note: keyNote(keyFile) }) };
  if (options.remote === null) return result;
  try {
    open({ ...ctx, palace }).sync();
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    return { ...result, warning: err.message };
  }
  return result;
}

function checkJoined(dir, palace, passphrase, ctx, joinRemote) {
  const settings = readSettings(dir);
  checkPin(settings, readMachine(ctx.env).palaces[palace], palace);
  if (!settings.protected && passphrase !== null) {
    throw new PalaceError(`settings mismatch: a passphrase was given, but the palace.json of ${palace} says it is not protected. Its settings may have been altered. Nothing was written.`);
  }
  const online = git.online(ctx.env, dir, joinRemote);
  if (online) {
    const foreign = git.foreignPaths(ctx.env, dir, 'HEAD');
    if (foreign.length > 0) throw git.foreignError(foreign, 'Nothing was written. Remove them from the remote and from this folder, then join again.');
  }
  if (settings.protected) unlockKeys(settings, { passphrase }, ctx.env, palace);
  return online;
}

function join(target, options, ctx) {
  const root = ctx.scope === 'project' ? projectRoot(ctx.env, ctx.cwd) : undefined;
  const dir = path.resolve(target ?? defaultFolder(ctx.scope, ctx.env, root));
  checkSource(options.passphrase);
  let palace;
  let origin = options.remote ?? null;
  if (fs.existsSync(path.join(dir, 'palace.json'))) {
    palace = fs.realpathSync(dir);
    const known = readMachine(ctx.env).palaces[palace];
    if (known) origin = recordedOrigin(known);
    else if (git.hasRepo(dir) && !Object.hasOwn(options, 'remote')) {
      throw new PalaceError(`${dir} has its own git repository. Pass this palace's remote URL to join as "remote", or null if it has none. Nothing was written.`);
    } else if (origin !== null && !git.hasRepo(dir)) {
      throw new PalaceError(`${dir} has no git repository, so join cannot attach a remote. Join without "remote", then run the remote command. Nothing was written.`);
    } else if (origin !== null) checkUrl(origin);
    const online = checkJoined(dir, palace, options.passphrase, ctx, known ? null : origin);
    if (online && !known) git.unlink(ctx.env, dir);
  } else {
    checkUrl(options.remote);
    const real = realTarget(dir, target === undefined);
    checkEmpty(dir);
    palace = buildBeside(dir, (temp) => {
      git.clone(ctx.env, options.remote, temp, gitTimeout(ctx, true));
      fs.chmodSync(temp, 0o700);
      if (!fs.existsSync(path.join(temp, 'palace.json'))) throw new PalaceError('the remote holds no palace: its main branch has no palace.json. Nothing was written.');
      checkJoined(temp, real, options.passphrase, ctx);
    });
  }
  const entry = { passphrase: options.passphrase, protected: readSettings(palace).protected, origin };
  const scope = ctx.scope ?? (Object.hasOwn(readMachine(ctx.env).palaces, palace) ? null : 'global');
  return { joined: palace, scope, default: bind(ctx.env, scope, palace, entry, root) };
}

function unlock(ctx) {
  const dir = target(ctx, 'unlock');
  readSettings(dir);
  return { removed: lock.remove(dir) };
}

function commit(store, tree, codec, change, record) {
  const seed = randomHex(16);
  let next = 0;
  const write = (page) => {
    const id = pageId(seed, next++);
    store.put(id, codec.encode(id, page));
    return id;
  };
  let step;
  store.begin(seed);
  try {
    const changed = change(write);
    const flushed = tree.flush(write);
    const free = [...flushed.freed, ...changed.freed];
    free.forEach(checkId);
    store.setMeta(codec.encode(META, { root: flushed.root, seed, free }));
    step = 'freeing the replaced pages';
    for (const id of free) store.free(id);
    step = 'the git commit';
    record();
    step = 'removing the pending marker';
    store.end();
    return changed.result;
  } catch (err) {
    if (!store.abort()) throw err;
    throw new PalaceError(`saved in the palace files, but ${step} failed: ${err.message}. The next operation finishes it. Do not save again.`);
  }
}

function checkPin(settings, entry, palace) {
  if (entry?.protected && !settings.protected) {
    throw new PalaceError(`settings mismatch: this machine's record says ${palace} is protected, but its palace.json says it is not. Nothing was changed.`);
  }
}

const notSynced = (why) => `${why} This change is saved locally, not yet synced.`;

const unconfirmed = 'the push waits: this palace is not protected, and its remote is not confirmed private. Check that the remote repository is private, then run remote with {"url": "<its URL>", "private": true}.';

function open(ctx) {
  const { env } = ctx;
  const dir = path.resolve(ctx.palace);
  let settings = readSettings(dir);
  const palace = fs.realpathSync(dir);
  const entry = readMachine(env).palaces[palace];
  let origin = recordedOrigin(entry);
  checkPin(settings, entry, palace);
  const keys = settings.protected ? unlockKeys(settings, entry, env, palace) : null;
  const codec = codecFor(keys);

  function checkPulled(text) {
    const pulled = parseSettings(text, "the remote's palace.json");
    if (pulled.protected !== settings.protected) {
      throw new PalaceError(`settings mismatch: the remote's palace.json turns protection ${pulled.protected ? 'on' : 'off'} for ${palace}. It may have been altered. Nothing was changed.`);
    }
    if (keys) checkBound(pulled, keys, "the remote's palace.json");
  }

  function pull(store, online, read, long) {
    if (online === null || origin === null) return undefined;
    const { warning } = git.fetchAndForward(env, online, origin, { timeoutMs: gitTimeout(ctx, long), read, checkLock: store.checkLock, checkSettings: checkPulled });
    settings = readSettings(dir);
    return warning;
  }

  function pushed(online, long) {
    if (!settings.protected && settings.privateRemote !== origin) return unconfirmed;
    try {
      git.push(env, online, origin, gitTimeout(ctx, long));
      return undefined;
    } catch (err) {
      if (!(err instanceof PalaceError)) throw err;
      return err.message;
    }
  }

  function operate(command, work, { pulls = true } = {}) {
    const raw = folderStore(dir);
    const store = ctx.wrapStore ? ctx.wrapStore(raw) : raw;
    const write = WRITES.has(command);
    store.lock({ write, waitMs: ctx.lockWaitMs ?? LOCK_WAIT_MS, command });
    let result;
    const warnings = [];
    try {
      const online = git.online(env, dir) ? dir : null;
      if (online) git.clearStaleLocks(online);
      store.checkLock();
      store.repair((bytes) => codec.decode(META, bytes), () => online && git.commit(env, online), () => online && git.refuseForeignHead(env, online));
      if (online) git.restore(env, online);
      const pulled = pulls ? pull(store, online, !write, command === 'sync') : undefined;
      const meta = codec.decode(META, store.getMeta());
      const read = (id) => codec.decode(id, store.get(id));
      const record = () => online && git.commit(env, online);
      result = work({ store, read, tree: createTree({ get: read }, settings.tree, meta.root), record, pulled, online });
      warnings.push(pulled, ...(result.warnings ?? []));
      if (write && online && command !== 'sync') warnings.push(git.gc(env, online));
    } finally {
      warnings.push(store.release());
      store.close();
    }
    const { warnings: _, ...answer } = result;
    const warning = warnings.filter(Boolean).join(' ');
    return warning ? { ...answer, warning } : answer;
  }

  function unsynced(online) {
    if (!online || origin === null) return { synced: false, warnings: [] };
    const why = pushed(online, false);
    return why === undefined ? { synced: true, warnings: [] } : { synced: false, warnings: [notSynced(why)] };
  }

  const shown = ([key, { title, summary, kind, saved }]) => ({ place: showPlace(key), title, summary, kind, saved });

  return {
    save(memory) {
      requireStrings(memory, ['place', 'title', 'summary', 'text', 'kind']);
      checkLimits(memory);
      const key = parsePlace(memory.place);
      return operate('save', ({ store, tree, record, online }) => {
        const result = commit(store, tree, codec, (write) => {
          const text = write({ t: 'x', text: memory.text });
          const { title, summary, kind } = memory;
          const old = tree.put(key, { title, summary, kind, saved: new Date().toISOString(), text });
          return { result: { saved: showPlace(key), replaced: Boolean(old) }, freed: old ? [old.text] : [] };
        }, record);
        return { ...result, ...unsynced(online) };
      });
    },
    recall(input) {
      requireStrings(input, ['place']);
      const key = parsePlace(input.place);
      return operate('recall', ({ read, tree }) => {
        const found = tree.get(key);
        if (!found) return { found: false };
        return { found: true, ...shown([key, found]), text: read(found.text).text };
      });
    },
    browse(input = {}) {
      const key = optionalKey(input);
      return operate('browse', ({ tree }) => ({ memories: tree.range(...(key === null ? [] : rangeOf(key))).map(shown) }));
    },
    list(input = {}) {
      const key = optionalKey(input);
      return operate('list', ({ tree }) => ({
        children: key === null ? tree.children('', null) : tree.children(childPrefix(key), rangeOf(key)[1]),
      }));
    },
    forget(input) {
      requireStrings(input, ['place']);
      const key = parsePlace(input.place);
      return operate('forget', ({ store, tree, record, online }) => {
        const old = tree.get(key);
        if (!old) return { forgot: showPlace(key), found: false };
        const result = commit(store, tree, codec, () => {
          tree.del(key);
          return { result: { forgot: showPlace(key), found: true }, freed: [old.text] };
        }, record);
        if (!online) return result;
        const { warnings } = unsynced(online);
        return { ...result, note: 'git history still holds earlier versions of this palace.', warnings };
      });
    },
    sync() {
      return operate('sync', ({ pulled, online }) => {
        if (online === null || origin === null) throw new PalaceError('this palace has no remote. Add one with remote. Nothing was changed.');
        if (pulled) throw new PalaceError(pulled);
        const why = pushed(online, true);
        if (why) throw new PalaceError(why);
        return { synced: true };
      });
    },
    setRemote(input) {
      checkUrl(input.url);
      return operate('remote', ({ store, online: existing }) => {
        git.checkRemote(env, existing, input.url, gitTimeout(ctx, true));
        if (!existing) git.init(env, dir);
        else if (input.url !== origin) git.dropTracking(env, dir);
        recordOrigin(env, palace, input.url);
        origin = input.url;
        const pulled = pull(store, dir, false, true);
        if (pulled && input.private === true) throw new PalaceError(pulled);
        if (input.private === true) {
          settings = withCheck({ ...settings, privateRemote: input.url }, keys);
          writeSettings(dir, settings);
        }
        git.commit(env, dir);
        const why = pushed(dir, true);
        return { remote: input.url, synced: !why, warnings: [pulled, why && notSynced(why)] };
      }, { pulls: false });
    },
    check() {
      return operate('check', ({ store, read, tree, record, online }) => {
        const stats = tree.check();
        const live = new Set(stats.ids);
        for (const [, { text }] of tree.range()) {
          read(text);
          live.add(text);
        }
        const unreachable = store.ids().filter((id) => !live.has(id));
        store.checkLock();
        store.begin(randomHex(16));
        unreachable.forEach((id) => store.free(id));
        record();
        store.end();
        const { warnings } = unsynced(online);
        return { memories: stats.count, height: stats.height, nodes: stats.nodes, unreachableRemoved: unreachable.length, warnings };
      });
    },
  };
}

function labelled(command, result, scope) {
  if (command === 'browse') return { ...result, memories: result.memories.map((memory) => ({ ...memory, scope })) };
  if (command === 'recall' && result.found) return { ...result, scope };
  return result;
}

const MERGE = {
  recall(answers) {
    const [first, ...others] = answers.filter((answer) => answer.found);
    if (!first) return { found: false };
    const { warning: _, ...memory } = first;
    return others.length > 0 ? { ...memory, alsoIn: others.map((answer) => answer.scope) } : memory;
  },
  browse: (answers) => ({ memories: answers.flatMap((answer) => answer.memories) }),
  list: (answers) => ({ children: [...new Set(answers.flatMap((answer) => answer.children))].sort() }),
};

function acrossScopes(command, input, ctx) {
  const machine = readMachine(ctx.env);
  const bound = boundFolders(ctx, machine);
  const answer = (scope, dir) => ({ ...labelled(command, open({ ...ctx, palace: dir })[command](input), scope), scope });
  const session = fromSession(ctx, (dir) => answer('session', dir));
  const answers = session.value ? [session.value] : [];
  const dirs = [];
  for (const scope of SCOPES) {
    const dir = bound[scope];
    if (dir && !dirs.includes(dir)) {
      dirs.push(dir);
      answers.push(prefixingErrors(scope, () => answer(scope, dir)));
    }
  }
  if (answers.length === 0 && !session.warning) throw new PalaceError('no palace set up on this machine');
  const merged = MERGE[command](answers);
  const warnings = [session.warning, ...answers.filter((one) => one.warning).map((one) => inScope(one.scope, one.warning))];
  const warning = warnings.filter(Boolean).join(' ');
  return warning ? { ...merged, warning } : merged;
}

function run(command, input, ctx) {
  if (READS.has(command) && ctx.palace === undefined && ctx.scope === undefined) return acrossScopes(command, input, ctx);
  const dir = target(ctx, command);
  const result = open({ ...ctx, palace: dir })[command === 'remote' ? 'setRemote' : command](input);
  if (!READS.has(command) && command !== 'save' && command !== 'forget') return result;
  const scope = ctx.palace === undefined ? ctx.scope ?? 'global' : scopeOf(dir, ctx);
  return READS.has(command) ? labelled(command, result, scope) : { ...result, scope };
}

module.exports = { status, setup, join, unlock, open, run, readMachine, readSettings, boundFolders };
