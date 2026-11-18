'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, parseJson } = require('./errors.js');
const { parsePlace, showPlace, rangeOf, childPrefix, checkLimits } = require('./place.js');
const { createTree } = require('./tree.js');
const { folderStore, pageId } = require('./stores.js');
const lock = require('./lock.js');

const FORMAT = 1;
const LOCK_WAIT_MS = 60000;
const TREE = { m: 128, L: 32 };
const MOMENTS = ['on-request', 'after-decision', 'end-of-task'];
const GITIGNORE = 'lock\n*.tmp\npending.*\n';
const WRITES = new Set(['save', 'forget', 'check']);

const encode = (page) => Buffer.from(JSON.stringify(page));
const decode = (bytes, what) => parseJson(Buffer.from(bytes).toString('utf8'), what);
const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

const machineFile = (env) => path.join(env.XDG_CONFIG_HOME || path.join(env.HOME, '.config'), 'memory-palace', 'config.json');

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

function checkSetup(dir, options) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new PalaceError(`${dir} is not empty. Nothing was written.`);
  if (options.backend !== 'folder') throw new PalaceError('backend must be "folder". Nothing was written.');
  if (options.passphrase !== null) throw new PalaceError('protected palaces are not available yet. Nothing was written.');
  const lists = [['kinds', options.kinds], ['moments', options.moments]];
  for (const [field, list] of lists) {
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) throw new PalaceError(`${field} must be a list of strings`);
  }
  const unknown = options.moments.find((moment) => !MOMENTS.includes(moment));
  if (unknown) throw new PalaceError(`moment ${unknown} is not one of ${MOMENTS.join(', ')}. Nothing was written.`);
}

function setup(target, options, ctx) {
  const dir = path.resolve(target);
  checkSetup(dir, options);
  const temp = path.join(path.dirname(dir), `.${path.basename(dir)}.setup-${randomHex(8)}`);
  fs.mkdirSync(temp);
  try {
    const settings = { format: FORMAT, backend: 'folder', protected: false, kdf: null, check: null, tree: TREE, kinds: options.kinds, moments: options.moments, privateRemote: null };
    fs.writeFileSync(path.join(temp, 'palace.json'), `${JSON.stringify(settings, null, 2)}\n`);
    fs.writeFileSync(path.join(temp, '.gitignore'), GITIGNORE);
    const store = folderStore(temp);
    const seed = randomHex(16);
    const root = pageId(seed, 0);
    store.begin(seed);
    store.put(root, encode({ t: 'l', k: [], v: [] }));
    store.setMeta(encode({ v: 1, root, seed, free: [] }));
    store.end();
    fs.renameSync(temp, dir);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw err;
  }
  const palace = fs.realpathSync(dir);
  const machine = readMachine(ctx.env);
  machine.palaces[palace] = { passphrase: null, protected: false };
  machine.default = palace;
  writeReplacing(machineFile(ctx.env), `${JSON.stringify(machine, null, 2)}\n`);
  return { palace, default: palace };
}

function unlock(ctx) {
  const dir = locate(ctx);
  readSettings(dir);
  return { removed: lock.remove(dir) };
}

function commit(store, tree, change) {
  const seed = randomHex(16);
  let next = 0;
  const write = (page) => {
    const id = pageId(seed, next++);
    store.put(id, encode(page));
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
    store.setMeta(encode({ v: 1, root: flushed.root, seed, free }));
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

  function operate(command, work) {
    const raw = folderStore(dir);
    const store = ctx.wrapStore ? ctx.wrapStore(raw) : raw;
    store.lock({ write: WRITES.has(command), waitMs: ctx.lockWaitMs ?? LOCK_WAIT_MS, command });
    try {
      store.repair((bytes) => decode(bytes, 'the meta page'));
      const meta = decode(store.getMeta(), 'the meta page');
      const read = (id) => decode(store.get(id), `page ${id}`);
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
        commit(store, tree, (write) => {
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
        return commit(store, tree, () => {
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
