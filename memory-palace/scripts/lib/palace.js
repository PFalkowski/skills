'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, parseJson } = require('./errors.js');
const { LIMITS, CONTROL, parsePlace, showPlace, rangeOf, childPrefix, checkLimits } = require('./place.js');
const { createTree } = require('./tree.js');
const { folderStore, sqliteStore, requireSqlite, pageId, checkId } = require('./stores.js');
const lock = require('./lock.js');
const seal = require('./seal.js');
const git = require('./git.js');

const FORMAT = 1;
const LOCK_WAIT_MS = 60000;
const TREE = { m: 128, L: 32 };
const TREE_MOST = 1024;
const MOST_KINDS = 32;
const MOST_URL = 2048;
const MOMENTS = ['on-request', 'after-decision', 'end-of-task'];
const GITIGNORE = 'lock\n*.tmp\npending.*\n';
const WRITES = new Set(['save', 'forget', 'sync', 'remote', 'check']);
const SHORT_GIT_MS = 20000;
const LONG_GIT_MS = 120000;
const META = 'meta';
const DEFAULT_N = 2 ** 17;
const STORES = { folder: folderStore, sqlite: sqliteStore };

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

const machineFile = (env) => path.join(env.XDG_CONFIG_HOME || path.join(env.HOME, '.config'), 'memory-palace', 'config.json');

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

function keyFileOutside(file, palace) {
  const real = realKeyFile(file);
  if (isInside(real, palace)) {
    throw new PalaceError(`the key file ${file} is inside the palace folder ${palace}. Keep it outside the palace. Nothing was changed.`);
  }
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
  if (!fs.existsSync(file)) return { default: null, palaces: {} };
  return parseJson(fs.readFileSync(file, 'utf8'), file);
}

function writeReplacing(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

function locate(ctx) {
  const dir = ctx.palace ?? readMachine(ctx.env).default;
  if (!dir) throw new PalaceError('no palace set up on this machine');
  return path.resolve(dir);
}

function readSettings(dir) {
  const file = path.join(dir, 'palace.json');
  if (!fs.existsSync(file)) throw new PalaceError(`no palace at ${dir}: ${file} is missing`);
  return parseSettings(fs.readFileSync(file, 'utf8'), file);
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
  if (!Object.hasOwn(STORES, settings.backend)) {
    throw new PalaceError(`${file} has an unknown backend; this version reads "folder" and "sqlite" only. Nothing was changed.`);
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

function status(ctx) {
  const machine = readMachine(ctx.env);
  const dir = ctx.palace ? path.resolve(ctx.palace) : machine.default;
  if (!dir) return { palace: null };
  const settings = readSettings(dir);
  const { backend, kinds, moments, privateRemote } = settings;
  const online = backend === 'folder' && git.online(ctx.env, dir, machine.palaces[fs.realpathSync(dir)]?.origin ?? null);
  return { palace: dir, backend, protected: settings.protected, online, remote: online ? git.originUrl(ctx.env, dir) : null, privateRemote, kinds, moments };
}

function checkSource(source) {
  const valid = source === null || (Object.keys(source ?? {}).length === 1 && (typeof source.env === 'string' || typeof source.file === 'string'));
  if (!valid) throw new PalaceError('passphrase must be null, {"env": "<variable name>"} or {"file": "<key file path>"}. Nothing was written.');
}

function checkUrl(url, backend) {
  if (backend === 'sqlite') {
    throw new PalaceError('a SQLite palace cannot have a git remote: git would keep a full copy of the database for every save. Use the folder backend for a palace with a remote. Nothing was written.');
  }
  if (typeof url !== 'string' || url === '') throw new PalaceError('the remote URL must be a non-empty string. Nothing was written.');
  if (!plainUrl(url)) throw new PalaceError(`the remote URL must be at most ${MOST_URL} characters with no control characters. Nothing was written.`);
  if (git.carriesSecret(url)) throw new PalaceError(git.SECRET_URL);
}

function protect(options, env, palace) {
  const kdf = { name: 'scrypt', N: options.kdf?.N ?? DEFAULT_N, r: 8, p: 1, salt: crypto.randomBytes(16).toString('base64') };
  if (!validKdf(kdf)) throw new PalaceError('kdf.N must be a power of two from 16384 (2^14) to 1048576 (2^20). Nothing was written.');
  const passphrase = readPassphrase(options.passphrase, env, palace);
  if (passphrase === '') throw new PalaceError('the passphrase is empty. Nothing was written.');
  return { kdf, keys: seal.deriveKeys(passphrase, kdf) };
}

function checkRepo(target, protection, env) {
  const repo = git.enclosingRepo(target, env);
  if (!repo || repo.allIgnored) return undefined;
  if (!protection) {
    throw new PalaceError(`${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this unprotected palace's memories in clear. Ignore the folder in ${repo.top}, choose a folder outside it, or turn on protection. Nothing was written.`);
  }
  return `${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this palace's sealed files.`;
}

const gitTimeout = (ctx, long) => ctx.gitTimeoutMs ?? (long ? LONG_GIT_MS : SHORT_GIT_MS);

function checkEmpty(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new PalaceError(`${dir} is not empty. Nothing was written.`);
}

function checkSetup(dir, real, options, ctx) {
  checkSource(options.passphrase);
  if (options.passphrase?.file !== undefined) keyFileOutside(options.passphrase.file, real);
  checkEmpty(dir);
  if (!Object.hasOwn(STORES, options.backend)) throw new PalaceError('backend must be "folder" or "sqlite". Nothing was written.');
  if (options.remote !== undefined) checkUrl(options.remote, options.backend);
  if (options.backend === 'sqlite') requireSqlite();
  const bad = badLists(options);
  if (bad) throw new PalaceError(`${bad}. Nothing was written.`);
  const protection = options.passphrase === null ? null : protect(options, ctx.env, real);
  if (options.remote === undefined) return { protection, warning: checkRepo(real, protection, ctx.env) };
  git.checkRemote(ctx.env, null, options.remote, gitTimeout(ctx, true));
  return { protection };
}

function realTarget(dir) {
  if (fs.existsSync(dir)) return fs.realpathSync(dir);
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)) throw new PalaceError(`the parent folder ${parent} does not exist. Create it first. Nothing was written.`);
  return path.join(fs.realpathSync(parent), path.basename(dir));
}

const writeMachine = (env, machine) => writeReplacing(machineFile(env), `${JSON.stringify(machine, null, 2)}\n`);

function register(env, palace, entry, makeDefault) {
  const machine = readMachine(env);
  if (makeDefault || !Object.hasOwn(machine.palaces, palace)) machine.default = palace;
  machine.palaces[palace] = entry;
  writeMachine(env, machine);
  return machine.default;
}

function recordOrigin(env, palace, origin) {
  const machine = readMachine(env);
  machine.palaces[palace] = { ...machine.palaces[palace], origin };
  writeMachine(env, machine);
}

function buildBeside(dir, build) {
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

function setup(target, options, ctx) {
  const dir = path.resolve(target);
  const { protection, warning } = checkSetup(dir, realTarget(dir), options, ctx);
  const codec = codecFor(protection?.keys ?? null);
  const palace = buildBeside(dir, (temp) => {
    fs.mkdirSync(temp);
    writeSettings(temp, withCheck({
      format: FORMAT, backend: options.backend, protected: Boolean(protection), kdf: protection?.kdf ?? null, check: null,
      tree: TREE, kinds: options.kinds, moments: options.moments, privateRemote: options.private === true ? options.remote : null,
    }, protection?.keys));
    fs.writeFileSync(path.join(temp, '.gitignore'), GITIGNORE);
    const store = STORES[options.backend](temp);
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
    if (options.remote === undefined) return;
    git.init(ctx.env, temp);
    git.setOrigin(ctx.env, temp, options.remote);
    git.commit(ctx.env, temp);
  });
  register(ctx.env, palace, { passphrase: options.passphrase, protected: Boolean(protection), origin: options.remote ?? null }, true);
  const result = { palace, default: palace, ...(warning && { warning }) };
  if (options.remote === undefined) return result;
  try {
    open({ ...ctx, palace }).sync();
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    return { ...result, warning: err.message };
  }
  return result;
}

function checkJoined(dir, palace, passphrase, ctx, recorded) {
  const settings = readSettings(dir);
  checkPin(settings, readMachine(ctx.env).palaces[palace], palace);
  if (!settings.protected && passphrase !== null) {
    throw new PalaceError(`settings mismatch: a passphrase was given, but the palace.json of ${palace} says it is not protected. Its settings may have been altered. Nothing was written.`);
  }
  const online = settings.backend === 'folder' && git.online(ctx.env, dir, recorded);
  if (online) {
    const foreign = git.foreignPaths(ctx.env, dir, 'HEAD');
    if (foreign.length > 0) throw git.foreignError(foreign, 'Nothing was written. Remove them from the remote and from this folder, then join again.');
  }
  if (settings.protected) unlockKeys(settings, { passphrase }, ctx.env, palace);
  return online ? git.originUrl(ctx.env, dir) : null;
}

function join(target, options, ctx) {
  const dir = path.resolve(target);
  checkSource(options.passphrase);
  let palace;
  let origin;
  if (fs.existsSync(path.join(dir, 'palace.json'))) {
    palace = fs.realpathSync(dir);
    const known = readMachine(ctx.env).palaces[palace];
    origin = checkJoined(dir, palace, options.passphrase, ctx, known && (known.origin ?? null));
  } else {
    checkUrl(options.remote, 'folder');
    const real = realTarget(dir);
    checkEmpty(dir);
    palace = buildBeside(dir, (temp) => {
      git.clone(ctx.env, options.remote, temp, gitTimeout(ctx, true));
      if (!fs.existsSync(path.join(temp, 'palace.json'))) throw new PalaceError('the remote holds no palace: its main branch has no palace.json. Nothing was written.');
      origin = checkJoined(temp, real, options.passphrase, ctx);
    });
  }
  const entry = { passphrase: options.passphrase, protected: readSettings(palace).protected, origin };
  return { joined: palace, default: register(ctx.env, palace, entry, false) };
}

function unlock(ctx) {
  const dir = locate(ctx);
  if (readSettings(dir).backend === 'sqlite') return { removed: null, note: 'a SQLite palace has no lock file: its lock ends with the command that holds it, even when that process is killed.' };
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
  const dir = locate(ctx);
  let settings = readSettings(dir);
  const palace = fs.realpathSync(dir);
  const entry = readMachine(env).palaces[palace];
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
    if (online === null || git.originUrl(env, online) === null) return undefined;
    const { warning } = git.fetchAndForward(env, online, { timeoutMs: gitTimeout(ctx, long), read, checkLock: store.checkLock, checkSettings: checkPulled });
    settings = readSettings(dir);
    return warning;
  }

  function pushed(online, long) {
    if (!settings.protected && settings.privateRemote !== git.originUrl(env, online)) return unconfirmed;
    try {
      git.push(env, online, gitTimeout(ctx, long));
      return undefined;
    } catch (err) {
      if (!(err instanceof PalaceError)) throw err;
      return err.message;
    }
  }

  function operate(command, work, { pulls = true } = {}) {
    const raw = STORES[settings.backend](dir);
    const store = ctx.wrapStore ? ctx.wrapStore(raw) : raw;
    const write = WRITES.has(command);
    store.lock({ write, waitMs: ctx.lockWaitMs ?? LOCK_WAIT_MS, command });
    let result;
    const warnings = [];
    try {
      const online = settings.backend === 'folder' && git.online(env, dir, command === 'remote' ? undefined : entry?.origin ?? null) ? dir : null;
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
    if (!online || git.originUrl(env, online) === null) return { synced: false, warnings: [] };
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
        if (online === null || git.originUrl(env, online) === null) throw new PalaceError('this palace has no remote. Add one with remote. Nothing was changed.');
        if (pulled) throw new PalaceError(pulled);
        const why = pushed(online, true);
        if (why) throw new PalaceError(why);
        return { synced: true };
      });
    },
    setRemote(input) {
      checkUrl(input.url, settings.backend);
      return operate('remote', ({ store, online: existing }) => {
        git.checkRemote(env, existing, input.url, gitTimeout(ctx, true));
        if (!existing) git.init(env, dir);
        git.setOrigin(env, dir, input.url);
        recordOrigin(env, palace, input.url);
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

module.exports = { status, setup, join, unlock, open };
