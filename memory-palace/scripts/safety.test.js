'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { setup, open } = require('./lib/palace.js');
const { acquire } = require('./lib/lock.js');
const { cli, support, envFor, waitFor, hashes, scan } = require('./test-support.js');

const SETTINGS = { passphrase: null, kinds: ['note'], moments: ['on-request'] };
const KILL_CAP = 40;
const mark = (i) => `MKPLh6q7Zx${i}x`;
const memory = (name) => ({ place: `h/${name}`, title: `title ${name}`, summary: `summary ${name}`, text: `text ${name}`, kind: 'note' });
const pageId = (seed, n) => crypto.createHash('sha256').update(`${seed}:${n}`).digest('hex').slice(0, 32);
const pagePath = (dir, id) => path.join(dir, 'pages', id.slice(0, 2), id);
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function sandbox(t, backend = 'folder') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-safety-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = envFor(root);
  let copies = 0;
  return {
    root,
    env,
    backend,
    copy: (from) => {
      const to = path.join(root, `copy-${copies++}`);
      fs.cpSync(from, to, { recursive: true });
      return to;
    },
    withPalace: (dir, fn, wrapStore) => {
      const palace = open({ env, palace: dir, lockWaitMs: 200, wrapStore });
      try {
        return fn(palace);
      } finally {
        palace.close();
      }
    },
    setUp: (name = 'palace', memories = []) => {
      const dir = path.join(root, name);
      setup(dir, { ...SETTINGS, backend }, { env });
      const palace = open({ env, palace: dir, lockWaitMs: 200 });
      try {
        for (const m of memories) palace.save(m);
      } finally {
        palace.close();
      }
      return dir;
    },
  };
}

function ok(result) {
  assert.strictEqual(result.code, 0, `exit ${result.code} ${result.signal || ''}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const placesOf = (memories) => memories.map((m) => m.place);
const readRecord = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'lock'), 'utf8'));
const withoutNonce = ({ nonce, ...rest }) => rest;

function assertBusy(result, dir, record, waitedMs) {
  assert.strictEqual(result.code, 1, result.stderr);
  for (const part of ['busy', `pid ${record.pid}`, record.host, record.command, record.started, `unlock --palace ${dir}`]) {
    assert.ok(result.stderr.includes(part), `"${part}" missing from: ${result.stderr}`);
  }
  assert.ok(waitedMs >= 300, `gave up after ${waitedMs} ms`);
}

async function timed(promise) {
  const started = Date.now();
  const result = await promise;
  return { result, ms: Date.now() - started };
}

test('lock: racing acquires have one winner', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp();
  const startAt = Date.now() + 1500;
  const racers = Array.from({ length: 8 }, () => support(env, { palace: dir, lockWaitMs: 200, startAt, hold: 1000 }));
  t.after(() => racers.forEach((r) => r.child.kill('SIGKILL')));
  const finished = [];
  racers.forEach((r) => r.done.then((result) => finished.push(result)));
  const deadline = Date.now() + 10000;
  while (finished.length < 7 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  const record = fs.existsSync(path.join(dir, 'lock')) ? readRecord(dir) : null;
  const results = await Promise.all(racers.map((r) => r.done));
  const winners = results.filter((r) => r.code === 0);
  assert.strictEqual(winners.length, 1, results.map((r) => `${r.pid}: ${r.code} ${r.stderr}`).join('\n'));
  for (const loser of results.filter((r) => r.code !== 0)) assert.match(loser.stderr, /busy/);
  assert.ok(record, 'no lock file while the winner held it and the losers had failed');
  assert.strictEqual(record.pid, winners[0].pid);
});

test('unlock prints the removed record', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp();
  const handle = acquire(dir, { waitMs: 200, command: 'browse' });
  const record = readRecord(dir);
  const result = await cli(env, ['unlock', '--palace', dir]);
  assert.deepStrictEqual(ok(result), { removed: withoutNonce(record) });
  assert.ok(!result.stdout.includes(record.nonce), 'unlock printed the nonce');
  assert.ok(!fs.existsSync(path.join(dir, 'lock')));
  handle.release();
});

test('unlock with no lock prints null', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp();
  assert.deepStrictEqual(ok(await cli(env, ['unlock', '--palace', dir])), { removed: null });
});

test('empty lock file gives busy without a readable record', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp();
  fs.writeFileSync(path.join(dir, 'lock'), '');
  const { result, ms } = await timed(support(env, { palace: dir, lockWaitMs: 200, ops: [{ op: 'save', input: memory('a') }] }).done);
  assert.strictEqual(result.code, 1, result.stderr);
  assert.match(result.stderr, /busy/);
  assert.match(result.stderr, /no readable record/);
  assert.ok(result.stderr.includes(`unlock --palace ${dir}`), result.stderr);
  assert.ok(ms >= 200, `gave up after ${ms} ms`);
});

test('markers: seed equals meta.seed', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('a'), memory('a')]);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta'), 'utf8'));
  assert.ok(meta.free.length > 0, 'the replacing save freed nothing');
  for (const id of meta.free) {
    fs.mkdirSync(path.dirname(pagePath(dir, id)), { recursive: true });
    fs.writeFileSync(pagePath(dir, id), 'stale');
  }
  const marker = path.join(dir, `pending.${meta.seed}`);
  fs.writeFileSync(marker, '');
  assert.deepStrictEqual(placesOf(ok(await cli(env, ['browse', '--palace', dir], {})).memories), ['h/a']);
  for (const id of meta.free) assert.ok(!fs.existsSync(pagePath(dir, id)), `freed page ${id} still present`);
  assert.ok(!fs.existsSync(marker), 'the marker is still present');
});

test('markers: unknown seed', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('a')]);
  const seed = '0123456789abcdef'.repeat(2);
  const planted = [0, 1, 2].map((n) => pagePath(dir, pageId(seed, n)));
  for (const file of planted) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'unfinished');
  }
  const marker = path.join(dir, `pending.${seed}`);
  fs.writeFileSync(marker, '');
  fs.writeFileSync(path.join(dir, 'meta.tmp'), 'unfinished');
  assert.deepStrictEqual(placesOf(ok(await cli(env, ['browse', '--palace', dir], {})).memories), ['h/a']);
  for (const file of [...planted, marker, path.join(dir, 'meta.tmp')]) assert.ok(!fs.existsSync(file), `${file} still present`);
});

test('a failure after the folder commit point keeps the save and the next repair finishes it', async (t) => {
  for (const step of ['free', 'end']) {
    await t.test(step, (t) => {
      const { setUp, withPalace } = sandbox(t);
      const dir = setUp(step, [memory('a')]);
      const failing = (store) => ({ ...store, [step]: () => { throw new Error(`injected ${step} failure`); } });
      const replacement = { ...memory('a'), title: 'replaced' };
      assert.throws(() => withPalace(dir, (p) => p.save(replacement), failing), new RegExp(`injected ${step} failure`));
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta'), 'utf8'));
      const marker = path.join(dir, `pending.${meta.seed}`);
      assert.ok(fs.existsSync(marker), 'the marker of the committed save is gone');
      assert.ok(meta.free.length > 0, 'the replacing save freed nothing');
      if (step === 'free') for (const id of meta.free) assert.ok(fs.existsSync(pagePath(dir, id)), `freed page ${id} removed before the failing free`);
      assert.deepStrictEqual(withPalace(dir, (p) => p.recall({ place: replacement.place })).title, 'replaced');
      assert.ok(!fs.existsSync(marker), 'the repair left the marker');
      for (const id of meta.free) assert.ok(!fs.existsSync(pagePath(dir, id)), `freed page ${id} still present`);
      assert.deepStrictEqual(withPalace(dir, (p) => p.check()), { memories: 1, height: 1, nodes: 1, unreachableRemoved: 0 });
    });
  }
});

test('check reports and removes unreachable pages', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('a')]);
  const orphan = pagePath(dir, pageId('f'.repeat(32), 7));
  fs.mkdirSync(path.dirname(orphan), { recursive: true });
  fs.writeFileSync(orphan, 'orphan');
  assert.deepStrictEqual(ok(await cli(env, ['check', '--palace', dir])), { memories: 1, height: 1, nodes: 1, unreachableRemoved: 1 });
  assert.ok(!fs.existsSync(orphan), 'the unreachable page is still present');
  assert.strictEqual(ok(await cli(env, ['check', '--palace', dir])).unreachableRemoved, 0);
});

function counting() {
  const counts = { gets: 0, puts: 0, metas: 0 };
  const wrap = (store) => ({
    ...store,
    get: (id) => { counts.gets++; return store.get(id); },
    put: (id, bytes) => { counts.puts++; return store.put(id, bytes); },
    getMeta: () => { counts.metas++; return store.getMeta(); },
  });
  return { counts, wrap };
}

async function killLoop(box, { base, op, input, before, after, forgotten }) {
  const { env, copy, withPalace } = box;
  let kills = 0;
  for (let k = 1; k <= KILL_CAP; k++) {
    const at = `${op} killed before mutation ${k}`;
    const work = copy(base);
    const run = await support(env, { palace: work, lockWaitMs: 200, killAt: k, ops: [{ op, input }] }).done;
    if (run.signal !== 'SIGKILL') {
      assert.strictEqual(run.code, 0, `${at}: ${run.stderr}`);
      assert.ok(kills > 0, `${op}: no kill point was reached`);
      return kills;
    }
    kills++;
    if (box.backend === 'folder') ok(await cli(env, ['unlock', '--palace', work]));

    const reopened = copy(work);
    const set = placesOf(withPalace(reopened, (p) => p.browse({}).memories));
    assert.ok(sameSet(set, before) || sameSet(set, after), `${at}: ${set.length} memories, neither old nor new`);
    const checked = withPalace(reopened, (p) => p.check());
    assert.strictEqual(checked.unreachableRemoved, 0, `${at}: unreachable pages after reopening`);
    if (forgotten && sameSet(set, after)) assert.deepStrictEqual(scan([reopened], [forgotten]), [], at);

    const rerun = copy(work);
    const { counts, wrap } = counting();
    withPalace(rerun, (p) => p[op](input), wrap);
    const h = Math.max(checked.height, withPalace(rerun, (p) => p.check()).height);
    const [reads, writes] = op === 'save' ? [h, 2 * h + 2] : [2 * h, 2 * h];
    assert.ok(counts.gets <= reads, `${at}: next ${op} read ${counts.gets} pages, bound ${reads}`);
    assert.ok(counts.puts <= writes, `${at}: next ${op} wrote ${counts.puts} pages, bound ${writes}`);
    assert.ok(counts.metas <= 2, `${at}: next ${op} read meta ${counts.metas} times`);
    if (forgotten) assert.deepStrictEqual(scan([rerun], [forgotten]), [], at);
  }
  assert.fail(`${op}: still killed after ${KILL_CAP} mutations`);
}

async function killedSaveAndForget(box) {
  const { copy, withPalace } = box;
  const marked = (i) => ({ ...memory(`m${String(i).padStart(2, '0')}`), title: `title ${mark(i)}`, text: `text ${mark(i)}` });
  const all = Array.from({ length: 33 }, (_, i) => marked(i));
  const base = box.setUp('base', all.slice(0, 32));
  assert.strictEqual(withPalace(base, (p) => p.check()).height, 1);
  const grown = copy(base);
  withPalace(grown, (p) => p.save(all[32]));
  assert.strictEqual(withPalace(grown, (p) => p.check()).height, 2, 'the 33rd save did not split the root');

  await killLoop(box, {
    base,
    op: 'save',
    input: all[32],
    before: placesOf(all.slice(0, 32)),
    after: placesOf(all),
  });

  let state = grown;
  let live = all;
  for (let i = 32; i >= 0; i--) {
    const trial = copy(state);
    withPalace(trial, (p) => p.forget({ place: all[i].place }));
    const rest = live.filter((m) => m.place !== all[i].place);
    if (withPalace(trial, (p) => p.check()).height === 1) {
      await killLoop(box, {
        base: state,
        op: 'forget',
        input: { place: all[i].place },
        before: placesOf(live),
        after: placesOf(rest),
        forgotten: mark(i),
      });
      return;
    }
    state = trial;
    live = rest;
  }
  assert.fail('no forget merged the two leaves');
}

test('H1/H6 folder', (t) => killedSaveAndForget(sandbox(t)));

test('H1 sqlite', (t) => killedSaveAndForget(sandbox(t, 'sqlite')));

async function twoWriters(t, backend) {
  const { env, setUp } = sandbox(t, backend);
  const dir = setUp();
  const startAt = Date.now() + 800;
  const batch = (who) => Array.from({ length: 50 }, (_, i) => ({ op: 'save', input: memory(`${who}${String(i).padStart(2, '0')}`) }));
  const writers = ['a', 'b'].map((who) => support(env, { palace: dir, lockWaitMs: 20000, startAt, ops: batch(who) }));
  t.after(() => writers.forEach((w) => w.child.kill('SIGKILL')));
  for (const result of await Promise.all(writers.map((w) => w.done))) assert.strictEqual(ok(result).length, 50);
  assert.strictEqual(ok(await cli(env, ['browse', '--palace', dir], {})).memories.length, 100);
  assert.strictEqual(ok(await cli(env, ['check', '--palace', dir])).memories, 100);
}

test('H2 folder: two writers', (t) => twoWriters(t, 'folder'));

test('H2 sqlite: two writers', (t) => twoWriters(t, 'sqlite'));

test('H3: unknown format', async (t) => {
  const { env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('a')]);
  const settingsFile = path.join(dir, 'palace.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')), format: 2 }));
  const before = hashes(dir);
  for (const args of [['browse'], ['save']]) {
    const result = await cli(env, [...args, '--palace', dir], args[0] === 'save' ? memory('b') : {});
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /format/);
    assert.match(result.stderr, /\b2\b/);
    assert.deepStrictEqual(hashes(dir), before);
  }
});

async function paused(t, env, dir, root, name, at, op) {
  const ready = path.join(root, `${name}.ready`);
  const resume = path.join(root, `${name}.resume`);
  const holder = support(env, { palace: dir, pause: { ...at, ready, resume }, ops: [op] });
  t.after(() => holder.child.kill('SIGKILL'));
  await waitFor(ready, holder.done);
  return { holder, resume: () => fs.writeFileSync(resume, '') };
}

const pausedSave = (t, env, dir, root, name) => paused(t, env, dir, root, name, { put: 1 }, { op: 'save', input: memory(name) });
const pausedBrowse = (t, env, dir, root, name) => paused(t, env, dir, root, name, { get: 2 }, { op: 'browse', input: {} });

test('H4 folder: killed writer, busy, unlock, save', async (t) => {
  const { root, env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('old')]);
  const { holder } = await pausedSave(t, env, dir, root, 'killed');
  const record = readRecord(dir);
  assert.strictEqual(record.pid, holder.child.pid);
  holder.child.kill('SIGKILL');
  assert.strictEqual((await holder.done).signal, 'SIGKILL');

  const { result, ms } = await timed(support(env, { palace: dir, lockWaitMs: 300, ops: [{ op: 'save', input: memory('next') }] }).done);
  assertBusy(result, dir, record, ms);
  assert.ok(ms < 2000, `busy took ${ms} ms`);
  assert.strictEqual(record.command, 'save');

  assert.deepStrictEqual(ok(await cli(env, ['unlock', '--palace', dir])), { removed: withoutNonce(record) });
  ok(await cli(env, ['save', '--palace', dir], memory('next')));
  ok(await cli(env, ['check', '--palace', dir]));
  const set = placesOf(ok(await cli(env, ['browse', '--palace', dir], {})).memories);
  assert.ok(sameSet(set, ['h/next', 'h/old']) || sameSet(set, ['h/killed', 'h/next', 'h/old']), set.join(', '));
});

async function readersDuringWrites(t, backend) {
  const { env, setUp } = sandbox(t, backend);
  const dir = setUp();
  const places = Array.from({ length: 50 }, (_, i) => `h5/m${String(i).padStart(2, '0')}`);
  const startAt = Date.now() + 800;
  const writer = support(env, {
    palace: dir,
    lockWaitMs: 20000,
    startAt,
    ops: places.map((place) => ({ op: 'save', input: { ...memory('x'), place } })),
  });
  const reader = support(env, { palace: dir, lockWaitMs: 20000, startAt, repeat: 300, ops: [{ op: 'browse', input: { place: 'h5' } }] });
  t.after(() => [writer, reader].forEach((c) => c.child.kill('SIGKILL')));
  const [written, browsed] = await Promise.all([writer.done, reader.done]);
  ok(written);
  for (const [i, result] of ok(browsed).entries()) {
    const seen = placesOf(result.memories);
    assert.deepStrictEqual(seen, places.slice(0, seen.length), `browse ${i}`);
  }
}

test('H5 folder: readers during writes', (t) => readersDuringWrites(t, 'folder'));

test('H5 sqlite: readers during writes', (t) => readersDuringWrites(t, 'sqlite'));

test('busy names a live holder', async (t) => {
  const { root, env, setUp } = sandbox(t);
  const dir = setUp('palace', [memory('old')]);
  const { holder, resume } = await pausedSave(t, env, dir, root, 'held');
  const held = fs.readFileSync(path.join(dir, 'lock'), 'utf8');
  const record = JSON.parse(held);
  assert.strictEqual(record.pid, holder.child.pid);

  const { result, ms } = await timed(support(env, { palace: dir, lockWaitMs: 300, ops: [{ op: 'save', input: memory('second') }] }).done);
  assertBusy(result, dir, record, ms);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'lock'), 'utf8'), held, 'the waiter changed the holder record');

  resume();
  ok(await holder.done);
  assert.ok(!fs.existsSync(path.join(dir, 'lock')), 'the lock file remains');
});

test('sqlite: second writer fails busy after the wait', async (t) => {
  const { root, env, setUp } = sandbox(t, 'sqlite');
  const dir = setUp('palace', [memory('old')]);
  const { holder, resume } = await pausedSave(t, env, dir, root, 'held');
  const { result, ms } = await timed(support(env, { palace: dir, lockWaitMs: 300, ops: [{ op: 'save', input: memory('second') }] }).done);
  assert.strictEqual(result.code, 1, result.stderr);
  assert.match(result.stderr, /busy/);
  assert.ok(result.stderr.includes(path.join(dir, 'palace.db')), result.stderr);
  assert.doesNotMatch(result.stderr, /unlock/);
  assert.ok(ms >= 300, `gave up after ${ms} ms`);
  resume();
  ok(await holder.done);
  assert.deepStrictEqual(placesOf(ok(await cli(env, ['browse', '--palace', dir], {})).memories), ['h/held', 'h/old']);
});

test('H4 sqlite: killed writer, next save succeeds', async (t) => {
  const { root, env, setUp } = sandbox(t, 'sqlite');
  const dir = setUp('palace', [memory('old')]);
  const { holder } = await pausedSave(t, env, dir, root, 'killed');
  holder.child.kill('SIGKILL');
  assert.strictEqual((await holder.done).signal, 'SIGKILL');

  const { result, ms } = await timed(cli(env, ['save', '--palace', dir], memory('next')));
  ok(result);
  assert.doesNotMatch(result.stderr, /unlock/);
  assert.ok(ms < 3000, `the next save took ${ms} ms`);
  ok(await cli(env, ['check', '--palace', dir]));
  const set = placesOf(ok(await cli(env, ['browse', '--palace', dir], {})).memories);
  assert.ok(sameSet(set, ['h/next', 'h/old']) || sameSet(set, ['h/killed', 'h/next', 'h/old']), set.join(', '));
});

const thirtyThree = Array.from({ length: 33 }, (_, i) => memory(`s${String(i).padStart(2, '0')}`));

test('sqlite: a reader sees one snapshot while a writer waits', async (t) => {
  const { root, env, setUp, withPalace } = sandbox(t, 'sqlite');
  const dir = setUp('palace', thirtyThree);
  assert.strictEqual(withPalace(dir, (p) => p.check()).height, 2, 'the browse would read one node only');
  const { holder: reader, resume } = await pausedBrowse(t, env, dir, root, 'reader');
  const writer = support(env, { palace: dir, lockWaitMs: 20000, ops: [{ op: 'save', input: memory('new') }] });
  t.after(() => writer.child.kill('SIGKILL'));
  const ended = {};
  reader.done.then(() => { ended.reader = process.hrtime.bigint(); });
  writer.done.then(() => { ended.writer = process.hrtime.bigint(); });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(ended.writer, undefined, 'the writer committed while the reader was inside its transaction');
  resume();
  const [browsed, written] = await Promise.all([reader.done, writer.done]);
  assert.deepStrictEqual(placesOf(ok(browsed)[0].memories), placesOf(thirtyThree));
  ok(written);
  assert.ok(ended.writer > ended.reader, 'the writer finished before the reader');
  assert.strictEqual(ok(await cli(env, ['browse', '--palace', dir], {})).memories.length, 34);
});

test('sqlite: a busy commit is rolled back by abort', async (t) => {
  const { root, env, setUp, withPalace } = sandbox(t, 'sqlite');
  const dir = setUp('palace', thirtyThree);
  const { holder: reader, resume } = await pausedBrowse(t, env, dir, root, 'reader');
  const calls = [];
  const watched = (store) => ({
    ...store,
    end: () => { calls.push('end'); return store.end(); },
    abort: () => { calls.push('abort'); return store.abort(); },
  });
  assert.throws(() => withPalace(dir, (p) => p.save(memory('late')), watched), /busy/);
  assert.deepStrictEqual(calls, ['end', 'abort']);
  resume();
  assert.deepStrictEqual(placesOf(ok(await reader.done)[0].memories), placesOf(thirtyThree));
  assert.deepStrictEqual(placesOf(withPalace(dir, (p) => p.browse({}).memories)), placesOf(thirtyThree));
  assert.deepStrictEqual(withPalace(dir, (p) => p.check()), { memories: 33, height: 2, nodes: 3, unreachableRemoved: 0 });
});

test('unlock on SQLite prints null with a note', async (t) => {
  const { env, setUp } = sandbox(t, 'sqlite');
  const dir = setUp('palace', [memory('a')]);
  const result = ok(await cli(env, ['unlock', '--palace', dir]));
  assert.deepStrictEqual(Object.keys(result), ['removed', 'note']);
  assert.strictEqual(result.removed, null);
  assert.match(result.note, /process/);
  assert.ok(!fs.existsSync(path.join(dir, 'lock')));
});
