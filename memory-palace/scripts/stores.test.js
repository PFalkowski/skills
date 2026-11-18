'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { folderStore, sqliteStore } = require('./lib/stores.js');
const { cli, envFor, hashes, scan } = require('./test-support.js');

const SEEDS = ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)];
const pageId = (seed, n) => crypto.createHash('sha256').update(`${seed}:${n}`).digest('hex').slice(0, 32);
const bytes = (text) => Buffer.from(text);
const textOf = (stored) => Buffer.from(stored).toString();
const metaBytes = (seed, free) => bytes(JSON.stringify({ seed, free }));
const decodeMeta = (stored) => JSON.parse(textOf(stored));
const missing = (id) => (err) => err.message.includes(id) && /missing/.test(err.message);

function tempDir(t, prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function pageStoreSuite(name, makeStore) {
  test(`stores (${name}): the page-store suite`, async (t) => {
    const session = (dir, fn) => {
      const store = makeStore(dir);
      store.lock({ write: true, waitMs: 200, command: 'test' });
      try {
        return fn(store);
      } finally {
        store.release();
        store.close();
      }
    };
    const commit = (store, seed, pages, free = []) => {
      store.begin(seed);
      pages.forEach((text, n) => store.put(pageId(seed, n), bytes(text)));
      store.setMeta(metaBytes(seed, free));
      for (const id of free) store.free(id);
      store.end();
    };

    await t.test('get, put, meta and free', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['zero', 'one']);
        assert.strictEqual(textOf(store.get(pageId(SEEDS[0], 0))), 'zero');
        assert.deepStrictEqual(decodeMeta(store.getMeta()), { seed: SEEDS[0], free: [] });
        commit(store, SEEDS[1], ['two'], [pageId(SEEDS[0], 0)]);
        assert.throws(() => store.get(pageId(SEEDS[0], 0)), missing(pageId(SEEDS[0], 0)));
      });
      session(dir, (store) => {
        assert.strictEqual(textOf(store.get(pageId(SEEDS[0], 1))), 'one');
        assert.strictEqual(textOf(store.get(pageId(SEEDS[1], 0))), 'two');
        assert.deepStrictEqual(decodeMeta(store.getMeta()).seed, SEEDS[1]);
      });
    });

    await t.test('begin, end and abort', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['kept']);
        store.begin(SEEDS[1]);
        store.put(pageId(SEEDS[1], 0), bytes('dropped'));
        store.abort();
        assert.throws(() => store.get(pageId(SEEDS[1], 0)), missing(pageId(SEEDS[1], 0)));
        assert.deepStrictEqual(decodeMeta(store.getMeta()).seed, SEEDS[0]);
        assert.strictEqual(textOf(store.get(pageId(SEEDS[0], 0))), 'kept');
      });
    });

    await t.test('a missing page throws naming it', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['only']);
        assert.throws(() => store.get(pageId(SEEDS[2], 0)), missing(pageId(SEEDS[2], 0)));
      });
    });

    await t.test('an uncommitted put never appears after reopening', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['committed']);
        store.begin(SEEDS[1]);
        store.put(pageId(SEEDS[1], 0), bytes('uncommitted'));
        store.put(pageId(SEEDS[1], 1), bytes('uncommitted'));
      });
      session(dir, (store) => {
        store.repair(decodeMeta);
        assert.throws(() => store.get(pageId(SEEDS[1], 0)), missing(pageId(SEEDS[1], 0)));
        assert.deepStrictEqual(store.ids(), [pageId(SEEDS[0], 0)]);
        assert.deepStrictEqual(decodeMeta(store.getMeta()).seed, SEEDS[0]);
      });
    });

    await t.test('ids lists stored pages', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['a', 'b', 'c']);
        commit(store, SEEDS[1], ['d'], [pageId(SEEDS[0], 1)]);
        const expected = [pageId(SEEDS[0], 0), pageId(SEEDS[0], 2), pageId(SEEDS[1], 0)];
        assert.deepStrictEqual([...store.ids()].sort(), expected.sort());
      });
    });
  });
}

pageStoreSuite('folder', folderStore);
pageStoreSuite('sqlite', sqliteStore);

test('stores: lock and release', (t) => {
  const dir = tempDir(t, 'mp-lock-');
  const lockFile = path.join(dir, 'lock');
  const first = folderStore(dir);
  first.lock({ write: true, waitMs: 200, command: 'save' });
  const held = fs.readFileSync(lockFile, 'utf8');
  const second = folderStore(dir);
  const started = Date.now();
  assert.throws(
    () => second.lock({ write: true, waitMs: 200, command: 'browse' }),
    (err) => {
      for (const part of ['busy', `pid ${process.pid}`, os.hostname(), 'save', `unlock --palace ${dir}`]) {
        assert.ok(err.message.includes(part), `"${part}" missing from: ${err.message}`);
      }
      return true;
    },
  );
  assert.ok(Date.now() - started >= 200, `gave up after ${Date.now() - started} ms`);
  assert.strictEqual(fs.readFileSync(lockFile, 'utf8'), held, 'the waiter changed the holder record');
  assert.strictEqual(first.release(), undefined, 'the holder was warned');
  assert.ok(!fs.existsSync(lockFile), 'release left the lock file');
  second.lock({ write: true, waitMs: 200, command: 'browse' });
  second.release();
  first.close();
  second.close();
});

const SETTINGS = { passphrase: null, kinds: ['note'], moments: ['on-request'] };
const NO_SQLITE = { NODE_OPTIONS: '--no-experimental-sqlite' };

function ok(result) {
  assert.strictEqual(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('stores: lock and release (sqlite)', (t) => {
  const dir = tempDir(t, 'mp-lock-');
  const first = sqliteStore(dir);
  first.lock({ write: true, waitMs: 200, command: 'save' });
  const second = sqliteStore(dir);
  const started = Date.now();
  assert.throws(
    () => second.lock({ write: true, waitMs: 200, command: 'save' }),
    (err) => {
      assert.match(err.message, /busy/);
      assert.ok(err.message.includes(path.join(dir, 'palace.db')), err.message);
      assert.doesNotMatch(err.message, /unlock/);
      return true;
    },
  );
  assert.ok(Date.now() - started >= 200, `gave up after ${Date.now() - started} ms`);
  assert.strictEqual(first.release(), undefined, 'the holder was warned');
  second.lock({ write: true, waitMs: 200, command: 'save' });
  second.release();
  first.close();
  second.close();
});

function forgetLeavesNoMarker(backend) {
  test(`G ${backend}: forget leaves no marker`, async (t) => {
    const root = tempDir(t, 'mp-g-');
    const env = envFor(root);
    const dir = path.join(root, 'palace');
    ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend }));
    const marks = ['MKPLgPlace3kx', 'MKPLgTitle8wx', 'MKPLgSumm5qx', 'MKPLgText1zx'];
    const marked = { place: `g/${marks[0]}`, title: marks[1], summary: marks[2], text: marks[3], kind: 'note' };
    ok(await cli(env, ['save'], marked));
    ok(await cli(env, ['save'], { place: 'g/kept', title: 'kept', summary: 'kept', text: 'kept', kind: 'note' }));
    assert.ok(scan([dir], marks).length > 0, 'the control scan found no marker before the forget');
    assert.deepStrictEqual(ok(await cli(env, ['forget'], { place: marked.place })).found, true);
    assert.deepStrictEqual(scan([dir], marks), []);
    assert.deepStrictEqual(ok(await cli(env, ['recall'], { place: marked.place })), { found: false });
    assert.deepStrictEqual(ok(await cli(env, ['browse'], { place: 'g' })).memories.map((m) => m.place), ['g/kept']);
  });
}

forgetLeavesNoMarker('folder');
forgetLeavesNoMarker('sqlite');

test('I1: folder flow under --no-experimental-sqlite', async (t) => {
  const root = tempDir(t, 'mp-i1-');
  const env = { ...envFor(root), ...NO_SQLITE };
  const dir = path.join(root, 'palace');
  const memory = { place: 'i1/room', title: 'title', summary: 'summary', text: 'text', kind: 'note' };
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'folder' }));
  ok(await cli(env, ['save'], memory));
  assert.strictEqual(ok(await cli(env, ['recall'], { place: memory.place })).text, memory.text);
  assert.deepStrictEqual(ok(await cli(env, ['browse'], {})).memories.map((m) => m.place), [memory.place]);
  assert.strictEqual(ok(await cli(env, ['forget'], { place: memory.place })).found, true);
  assert.deepStrictEqual(ok(await cli(env, ['browse'], {})).memories, []);
});

test('I2: SQLite under --no-experimental-sqlite', async (t) => {
  const root = tempDir(t, 'mp-i2-');
  const env = envFor(root);
  const noSqlite = { ...env, ...NO_SQLITE };
  const machine = path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
  const names = (result) => {
    assert.strictEqual(result.code, 1, result.stderr);
    assert.ok(result.stderr.includes('node:sqlite'), result.stderr);
    assert.ok(result.stderr.includes(process.version), `${process.version} missing from: ${result.stderr}`);
    assert.strictEqual(result.stdout, '');
  };

  const refused = path.join(root, 'refused');
  names(await cli(noSqlite, ['setup', '--palace', refused], { ...SETTINGS, backend: 'sqlite' }));
  assert.ok(!fs.existsSync(refused), `${refused} exists`);
  assert.deepStrictEqual(fs.readdirSync(root).filter((name) => name.includes('.setup-')), [], 'a setup temp sibling is left');
  assert.ok(!fs.existsSync(machine), 'a machine record was written');

  const dir = path.join(root, 'palace');
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'sqlite' }));
  ok(await cli(env, ['save'], { place: 'i2/room', title: 'title', summary: 'summary', text: 'text', kind: 'note' }));
  const before = { palace: hashes(dir), machine: fs.readFileSync(machine) };
  for (const [command, input] of [['browse', {}], ['save', { place: 'i2/other', title: 't', summary: 's', text: 'x', kind: 'note' }]]) {
    names(await cli(noSqlite, [command], input));
    assert.deepStrictEqual(hashes(dir), before.palace, `${command} changed the palace`);
    assert.deepStrictEqual(fs.readFileSync(machine), before.machine, `${command} changed the machine record`);
  }
});
