'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { folderStore } = require('./lib/stores.js');
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

    await t.test('a page id that is not 32 lowercase hexadecimal characters is refused', (t) => {
      const dir = tempDir(t, 'mp-store-');
      session(dir, (store) => {
        commit(store, SEEDS[0], ['only']);
        const long = `../${'x'.repeat(100)}`;
        for (const id of ['../outside', long, 'A'.repeat(32), [pageId(SEEDS[0], 0)]]) {
          for (const call of [() => store.get(id), () => store.put(id, bytes('x')), () => store.free(id)]) {
            assert.throws(call, (err) => /^page id ".{0,40}" is not valid: the palace is damaged or altered/.test(err.message) && !err.message.includes(long));
          }
        }
        assert.deepStrictEqual(store.ids(), [pageId(SEEDS[0], 0)]);
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
function ok(result) {
  assert.strictEqual(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

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
function alteredPalace(t) {
  const root = tempDir(t, 'mp-altered-');
  const env = envFor(root);
  const dir = path.join(root, 'palace');
  const outside = path.join(root, 'outside.txt');
  fs.writeFileSync(outside, JSON.stringify({ t: 'x', text: 'TOKEN-OUTSIDE-THE-PALACE' }));
  const page = (id) => path.join(dir, 'pages', id.slice(0, 2), id);
  const rootId = () => JSON.parse(fs.readFileSync(path.join(dir, 'meta'), 'utf8')).root;
  const edit = (id, change) => fs.writeFileSync(page(id), JSON.stringify(change(JSON.parse(fs.readFileSync(page(id), 'utf8')))));
  return { env, dir, outside, page, rootId, edit };
}

const MISC = { place: 'notes/misc', title: 't', summary: 's', text: 'inside', kind: 'note' };

function refused(result, pattern) {
  assert.strictEqual(result.code, 1, result.stdout);
  assert.match(result.stderr, pattern);
  assert.ok(!result.stderr.includes('TOKEN-OUTSIDE'), result.stderr);
}

test('a page id of ../ in a leaf is refused: recall reads nothing outside, a replacing save deletes nothing', async (t) => {
  const { env, dir, outside, rootId, edit } = alteredPalace(t);
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'folder' }));
  ok(await cli(env, ['save'], MISC));
  edit(rootId(), (leaf) => ({ ...leaf, v: [{ ...leaf.v[0], text: '../outside.txt' }] }));
  refused(await cli(env, ['recall'], { place: MISC.place }), /page id "\.\.\/outside\.txt" is not valid: the palace is damaged or altered/);
  const before = hashes(dir);
  refused(await cli(env, ['save'], { ...MISC, text: 'replacing' }), /is not valid/);
  assert.ok(fs.existsSync(outside), 'the replacing save deleted a file outside the palace');
  assert.deepStrictEqual(hashes(dir), before, 'the refused save changed the palace');
});

test('a page replaced by a symbolic link is refused', async (t) => {
  const { env, dir, outside, page, rootId } = alteredPalace(t);
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'folder' }));
  ok(await cli(env, ['save'], MISC));
  const text = JSON.parse(fs.readFileSync(page(rootId()), 'utf8')).v[0].text;
  fs.rmSync(page(text));
  fs.symlinkSync(outside, page(text));
  refused(await cli(env, ['recall'], { place: MISC.place }), new RegExp(`page ${text} is not a regular file: the palace is damaged or altered`));
});

test('a page that lists itself as a child ends with the integrity error and leaves no lock', async (t) => {
  const { env, dir, rootId, edit } = alteredPalace(t);
  ok(await cli(env, ['setup', '--palace', dir], { ...SETTINGS, backend: 'folder' }));
  ok(await cli(env, ['save'], MISC));
  const id = rootId();
  edit(id, () => ({ t: 'i', k: ['x'], c: [id, id] }));
  const started = Date.now();
  refused(await cli(env, ['recall'], { place: MISC.place }), /integrity check failed/);
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  assert.ok(!fs.existsSync(path.join(dir, 'lock')), 'the lock was left');
});
