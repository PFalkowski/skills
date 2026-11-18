'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, parseJson } = require('./errors.js');
const { parsePlace, showPlace, rangeOf, childPrefix, checkLimits } = require('./place.js');
const { createTree } = require('./tree.js');
const { folderStore, pageId } = require('./stores.js');
const lock = require('./lock.js');
const seal = require('./seal.js');
const { enclosingRepo } = require('./git.js');

const FORMAT = 1;
const LOCK_WAIT_MS = 60000;
const TREE = { m: 128, L: 32 };
const MOMENTS = ['on-request', 'after-decision', 'end-of-task'];
const GITIGNORE = 'lock\n*.tmp\npending.*\n';
const WRITES = new Set(['save', 'forget', 'check']);
const META = 'meta';
const DEFAULT_N = 2 ** 17;

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

function unlockKeys(settings, entry, env, palace) {
  if (!entry?.passphrase) throw new PalaceError(`no passphrase: ${palace} is protected, and ${machineFile(env)} records no passphrase source for it.`);
  const keys = seal.deriveKeys(readPassphrase(entry.passphrase, env, palace), settings.kdf);
  const expected = Buffer.from(settings.check, 'hex');
  const actual = seal.checkValue(keys);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new PalaceError(`wrong passphrase: it does not open ${palace}. Nothing was changed.`);
  }
  return keys;
}

function readMachine(env) {
  const file = machineFile(env);
  if (!fs.existsSync(file)) return { version: 1, default: null, palaces: {} };
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
  const settings = parseJson(fs.readFileSync(file, 'utf8'), file);
  if (settings.format !== FORMAT) {
    throw new PalaceError(`${file} has format ${settings.format}; this version reads format ${FORMAT} only. Nothing was changed.`);
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
  const dir = ctx.palace ? path.resolve(ctx.palace) : readMachine(ctx.env).default;
  if (!dir) return { palace: null };
  const settings = readSettings(dir);
  const { backend, kinds, moments, privateRemote } = settings;
  return { palace: dir, backend, protected: settings.protected, online: false, remote: null, privateRemote, kinds, moments };
}

function checkSource(source) {
  const valid = source === null || (Object.keys(source ?? {}).length === 1 && (typeof source.env === 'string' || typeof source.file === 'string'));
  if (!valid) throw new PalaceError('passphrase must be null, {"env": "<variable name>"} or {"file": "<key file path>"}. Nothing was written.');
}

function protect(options, env, palace) {
  const kdf = { name: 'scrypt', N: options.kdf?.N ?? DEFAULT_N, r: 8, p: 1, salt: crypto.randomBytes(16).toString('base64') };
  if (!validKdf(kdf)) throw new PalaceError('kdf.N must be a power of two from 16384 (2^14) to 1048576 (2^20). Nothing was written.');
  const passphrase = readPassphrase(options.passphrase, env, palace);
  if (passphrase === '') throw new PalaceError('the passphrase is empty. Nothing was written.');
  const keys = seal.deriveKeys(passphrase, kdf);
  return { kdf, check: seal.checkValue(keys).toString('hex'), keys };
}

function checkRepo(target, protection, env) {
  const repo = enclosingRepo(target, env);
  if (!repo || repo.allIgnored) return undefined;
  if (!protection) {
    throw new PalaceError(`${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this unprotected palace's memories in clear. Ignore the folder in ${repo.top}, choose a folder outside it, or turn on protection. Nothing was written.`);
  }
  return `${target} is inside the git repository ${repo.top} and is not ignored there, so that repository's commits would take this palace's sealed files.`;
}

function checkSetup(dir, real, options, env) {
  checkSource(options.passphrase);
  if (options.passphrase?.file !== undefined) keyFileOutside(options.passphrase.file, real);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new PalaceError(`${dir} is not empty. Nothing was written.`);
  if (options.backend !== 'folder') throw new PalaceError('backend must be "folder". Nothing was written.');
  const lists = [['kinds', options.kinds], ['moments', options.moments]];
  for (const [field, list] of lists) {
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) throw new PalaceError(`${field} must be a list of strings`);
  }
  const unknown = options.moments.find((moment) => !MOMENTS.includes(moment));
  if (unknown) throw new PalaceError(`moment ${unknown} is not one of ${MOMENTS.join(', ')}. Nothing was written.`);
  const protection = options.passphrase === null ? null : protect(options, env, real);
  return { protection, warning: checkRepo(real, protection, env) };
}

function realTarget(dir) {
  if (fs.existsSync(dir)) return fs.realpathSync(dir);
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)) throw new PalaceError(`the parent folder ${parent} does not exist. Create it first. Nothing was written.`);
  return path.join(fs.realpathSync(parent), path.basename(dir));
}

function setup(target, options, ctx) {
  const dir = path.resolve(target);
  const { protection, warning } = checkSetup(dir, realTarget(dir), options, ctx.env);
  const codec = codecFor(protection?.keys ?? null);
  const temp = path.join(path.dirname(dir), `.${path.basename(dir)}.setup-${randomHex(8)}`);
  fs.mkdirSync(temp);
  try {
    const settings = {
      format: FORMAT, backend: 'folder', protected: Boolean(protection), kdf: protection?.kdf ?? null, check: protection?.check ?? null,
      tree: TREE, kinds: options.kinds, moments: options.moments, privateRemote: null,
    };
    fs.writeFileSync(path.join(temp, 'palace.json'), `${JSON.stringify(settings, null, 2)}\n`);
    fs.writeFileSync(path.join(temp, '.gitignore'), GITIGNORE);
    const store = folderStore(temp);
    const seed = randomHex(16);
    const root = pageId(seed, 0);
    store.begin(seed);
    store.put(root, codec.encode(root, { t: 'l', k: [], v: [] }));
    store.setMeta(codec.encode(META, { v: 1, root, seed, free: [] }));
    store.end();
    fs.renameSync(temp, dir);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw err;
  }
  const palace = fs.realpathSync(dir);
  const machine = readMachine(ctx.env);
  machine.palaces[palace] = { passphrase: options.passphrase, protected: Boolean(protection) };
  machine.default = palace;
  writeReplacing(machineFile(ctx.env), `${JSON.stringify(machine, null, 2)}\n`);
  return { palace, default: palace, ...(warning && { warning }) };
}

function unlock(ctx) {
  const dir = locate(ctx);
  readSettings(dir);
  return { removed: lock.remove(dir) };
}

function commit(store, tree, codec, change) {
  const seed = randomHex(16);
  let next = 0;
  const write = (page) => {
    const id = pageId(seed, next++);
    store.put(id, codec.encode(id, page));
    return id;
  };
  store.begin(seed);
  let result;
  let free;
  try {
    const changed = change(write);
    const flushed = tree.flush(write);
    result = changed.result;
    free = [...flushed.freed, ...changed.freed];
    store.setMeta(codec.encode(META, { v: 1, root: flushed.root, seed, free }));
  } catch (err) {
    store.abort();
    throw err;
  }
  for (const id of free) store.free(id);
  store.end();
  return result;
}

function open(ctx) {
  const dir = locate(ctx);
  const settings = readSettings(dir);
  const palace = fs.realpathSync(dir);
  const entry = readMachine(ctx.env).palaces[palace];
  if (entry?.protected && !settings.protected) {
    throw new PalaceError(`settings mismatch: this machine's record says ${palace} is protected, but its palace.json says it is not. Nothing was changed.`);
  }
  const codec = codecFor(settings.protected ? unlockKeys(settings, entry, ctx.env, palace) : null);

  function operate(command, work) {
    const raw = folderStore(dir);
    const store = ctx.wrapStore ? ctx.wrapStore(raw) : raw;
    store.lock({ write: WRITES.has(command), waitMs: ctx.lockWaitMs ?? LOCK_WAIT_MS, command });
    try {
      store.repair((bytes) => codec.decode(META, bytes));
      const meta = codec.decode(META, store.getMeta());
      const read = (id) => codec.decode(id, store.get(id));
      return work({ store, read, tree: createTree({ get: read }, settings.tree, meta.root) });
    } finally {
      store.release();
      store.close();
    }
  }

  const shown = ([key, { title, summary, kind, saved }]) => ({ place: showPlace(key), title, summary, kind, saved });

  return {
    save(memory) {
      requireStrings(memory, ['place', 'title', 'summary', 'text', 'kind']);
      checkLimits(memory);
      const key = parsePlace(memory.place);
      return operate('save', ({ store, tree }) =>
        commit(store, tree, codec, (write) => {
          const text = write({ t: 'x', text: memory.text });
          const { title, summary, kind } = memory;
          const old = tree.put(key, { title, summary, kind, saved: new Date().toISOString(), text });
          return { result: { saved: showPlace(key), replaced: Boolean(old), synced: false }, freed: old ? [old.text] : [] };
        }),
      );
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
      return operate('forget', ({ store, tree }) => {
        const old = tree.get(key);
        if (!old) return { forgot: showPlace(key), found: false };
        return commit(store, tree, codec, () => {
          tree.del(key);
          return { result: { forgot: showPlace(key), found: true }, freed: [old.text] };
        });
      });
    },
    check() {
      return operate('check', ({ store, read, tree }) => {
        const stats = tree.check();
        const live = new Set(stats.ids);
        for (const [, { text }] of tree.range()) {
          read(text);
          live.add(text);
        }
        const unreachable = store.ids().filter((id) => !live.has(id));
        unreachable.forEach((id) => store.free(id));
        return { memories: stats.count, height: stats.height, nodes: stats.nodes, unreachableRemoved: unreachable.length };
      });
    },
    close() {},
  };
}

module.exports = { status, setup, unlock, open };
