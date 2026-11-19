'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setup, open } = require('./lib/palace.js');
const { folderStore } = require('./lib/stores.js');
const seal = require('./lib/seal.js');
const { envFor } = require('./test-support.js');

const SEED = 20261118;
const VAR = 'MP_TEST_PASSPHRASE';
const PASS = 'MKPLpass-fake-passphrase-0000';
const PROTECTED = { backend: 'folder', passphrase: { env: VAR }, kdf: { N: 2 ** 14 }, kinds: ['note'], moments: ['on-request'] };
const SMALL = 1000;
const ABSENT = ['aaa', 'zzz/x', 'wing/cellar', 'wing/room/m9999'];
const NEW_PLACES = ['aaa/new', 'atrium/f2000x', 'wing/attic/new', 'wing/room/m0250x', 'wing/room 3/new', 'yard/f0000x', 'zzz/new'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (i) => String(i).padStart(4, '0');
const series = (count, name) => Array.from({ length: count }, (_, i) => name(pad(i)));
const keyOf = (place) => place.split('/').join('\0');
const memoryOf = (place) => ({ place, title: `title ${place}`, summary: `summary ${place}`, text: `text of ${place}`, kind: 'note' });

const SORTED = [
  'wing/room',
  ...series(500, (i) => `wing/room/m${i}`),
  ...series(50, (i) => `wing/hall/h${i}`),
  'wing/attic',
  ...['room 3', 'room-2', 'room.old'].flatMap((sibling) => series(200, (i) => `wing/${sibling}/s${i}`)),
  ...series(4424, (i) => `atrium/f${i}`),
  ...series(4424, (i) => `yard/f${i}`),
].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ORDERS = { reversed: [...SORTED].reverse(), shuffled: shuffled(SORTED, mulberry32(SEED)) };
const under = (places, place) => places.filter((p) => p === place || p.startsWith(`${place}/`));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bounds-')));
const gitConfig = path.join(root, 'gitconfig');
fs.writeFileSync(gitConfig, '');
const env = { ...envFor(root), GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1', [VAR]: PASS };
const machineFile = path.join(env.XDG_CONFIG_HOME, 'memory-palace', 'config.json');
const palaces = {};

function copyPalace(from, to) {
  fs.cpSync(from, to, { recursive: true });
  const record = readJson(machineFile);
  record.palaces[to] = record.palaces[from];
  fs.writeFileSync(machineFile, JSON.stringify(record));
}

function build(name, order) {
  const dir = path.join(root, name);
  setup(dir, PROTECTED, { env });
  const palace = open({ env, palace: dir });
  order.forEach((place, i) => {
    if (i === SMALL) copyPalace(dir, `${dir}-${SMALL}`);
    palace.save(memoryOf(place));
  });
  const keys = seal.deriveKeys(PASS, readJson(path.join(dir, 'palace.json')).kdf);
  palaces[name] = {
    [order.length]: { dir, keys, places: SORTED },
    [SMALL]: { dir: `${dir}-${SMALL}`, keys, places: [...order.slice(0, SMALL)].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)) },
  };
}

test.before(() => {
  for (const [name, order] of Object.entries(ORDERS)) build(name, order);
});
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function walk({ dir, keys }) {
  const store = folderStore(dir);
  const read = (id, bytes) => JSON.parse(seal.open(keys, `memory-palace/1/${id}`, bytes));
  const shape = { nodes: new Set(), leaves: new Set(), texts: new Set(), height: 0 };
  const visit = (id, depth) => {
    const node = read(id, store.get(id));
    shape.nodes.add(id);
    if (node.t === 'i') {
      node.c.forEach((child) => visit(child, depth + 1));
    } else {
      shape.leaves.add(id);
      shape.height = Math.max(shape.height, depth);
      node.v.forEach(({ text }) => shape.texts.add(text));
    }
  };
  visit(read('meta', store.getMeta()).root, 1);
  return shape;
}

function counted({ dir }) {
  let log;
  const palace = open({
    env,
    palace: dir,
    wrapStore: (store) => ({
      ...store,
      get: (id) => {
        log.gets.push(id);
        return store.get(id);
      },
      getMeta: () => {
        log.metas++;
        return store.getMeta();
      },
      put: (id, bytes) => {
        log.puts.push(id);
        return store.put(id, bytes);
      },
      setMeta: (bytes) => {
        log.metaWrites++;
        return store.setMeta(bytes);
      },
    }),
  });
  return (op, input) => {
    log = { gets: [], metas: 0, puts: [], metaWrites: 0 };
    return { result: palace[op](input), ...log };
  };
}

function reads(run, shape) {
  const nodes = run.gets.filter((id) => shape.nodes.has(id)).length;
  return { nodes, texts: run.gets.filter((id) => shape.texts.has(id)).length, other: run.metas + run.gets.length - nodes };
}

function writes(run, shape) {
  const nodes = run.puts.filter((id) => shape.nodes.has(id)).length;
  return { nodes, other: run.metaWrites + run.puts.length - nodes };
}

function lookups(places, random) {
  const picks = Array.from({ length: 100 }, () => places[Math.floor(random() * places.length)]);
  return [places[0], places.at(-1), places[places.length >> 1], ...picks, ...ABSENT];
}

function nonNodeReads(palace, picks) {
  const shape = walk(palace);
  const seen = { present: new Set(), absent: new Set() };
  for (const place of picks) {
    const run = counted(palace)('recall', { place });
    seen[run.result.found ? 'present' : 'absent'].add(reads(run, shape).other);
  }
  return { present: [...seen.present], absent: [...seen.absent] };
}

test('A1: lookups stay within the height', () => {
  for (const [name, sizes] of Object.entries(palaces)) {
    const palace = sizes[SORTED.length];
    const shape = walk(palace);
    const picks = lookups(SORTED, mulberry32(SEED + 1));
    assert.ok(picks.length >= 107);
    for (const place of picks) {
      const at = `seed ${SEED}, ${name}, recall ${place}`;
      const run = counted(palace)('recall', { place });
      const count = reads(run, shape);
      assert.ok(count.nodes <= shape.height, `${at}: ${count.nodes} node reads, height ${shape.height}`);
      assert.ok(run.metas <= 1, `${at}: ${run.metas} meta reads`);
      assert.ok(count.texts <= 1, `${at}: ${count.texts} text pages`);
      if (ABSENT.includes(place)) {
        assert.deepStrictEqual(run.result, { found: false }, at);
        assert.strictEqual(count.texts, 0, at);
      } else {
        assert.strictEqual(run.result.text, `text of ${place}`, at);
      }
    }
  }
});

test('A1: height and size', () => {
  for (const [name, sizes] of Object.entries(palaces)) {
    const palace = sizes[SORTED.length];
    const { m, L } = readJson(path.join(palace.dir, 'palace.json')).tree;
    const g = Math.ceil(m / 2);
    const f = Math.ceil(L / 2);
    const bound = Math.floor(2 + Math.log(SORTED.length / (2 * f)) / Math.log(g));
    const shape = walk(palace);
    assert.ok(shape.height >= 3, `${name}: height ${shape.height} is under 3 levels`);
    assert.ok(shape.height <= bound, `${name}: height ${shape.height} over the bound ${bound} for m ${m}, L ${L}`);
    assert.ok(shape.nodes.size >= 10 * shape.height, `${name}: ${shape.nodes.size} nodes at height ${shape.height}`);
  }
});

test('A1: non-node reads do not grow', () => {
  for (const [name, sizes] of Object.entries(palaces)) {
    const counts = [SMALL, SORTED.length].map((size) => {
      const { places } = sizes[size];
      return nonNodeReads(sizes[size], [...lookups(places, mulberry32(SEED + 2)).slice(0, 13), ...ABSENT]);
    });
    assert.deepStrictEqual(counts[0], counts[1], `seed ${SEED}, ${name}: non-node reads at ${SMALL} and ${SORTED.length}`);
    assert.ok(Math.max(...counts[1].present, ...counts[1].absent) <= 2, `${name}: ${JSON.stringify(counts[1])}`);
  }
});

test('A2: browses are exact and bounded', () => {
  const browses = { 'wing/attic': 1, 'wing/hall': 50, 'wing/room': 501, 'wing/cellar': 0, 'wing/room 3': 200 };
  for (const [name, sizes] of Object.entries(palaces)) {
    const palace = sizes[SORTED.length];
    const shape = walk(palace);
    const run = counted(palace);
    const f = Math.ceil(readJson(path.join(palace.dir, 'palace.json')).tree.L / 2);
    for (const [place, k] of Object.entries(browses)) {
      const at = `${name}, browse ${place}`;
      const browsed = run('browse', { place });
      assert.deepStrictEqual(browsed.result.memories.map((memory) => memory.place), under(SORTED, place), at);
      assert.strictEqual(browsed.result.memories.length, k, at);
      const count = reads(browsed, shape);
      const bound = shape.height + Math.ceil(k / f) + 3;
      assert.ok(count.nodes <= bound, `${at}: ${count.nodes} node reads, bound ${bound}`);
      assert.ok(count.other <= 2, `${at}: ${count.other} other pages`);
      assert.strictEqual(count.texts, 0, `${at}: read a text page`);
    }
  }
});

test('A3: listings are exact and bounded', () => {
  const listings = [
    ['wing', ['attic', 'hall', 'room', 'room 3', 'room-2', 'room.old']],
    [undefined, ['atrium', 'wing', 'yard']],
    ['wing/cellar', []],
  ];
  for (const [name, sizes] of Object.entries(palaces)) {
    const palace = sizes[SORTED.length];
    const shape = walk(palace);
    const run = counted(palace);
    const { L } = readJson(path.join(palace.dir, 'palace.json')).tree;
    for (const [place, children] of listings) {
      const at = `${name}, list ${place ?? 'the root'}`;
      const listed = run('list', place === undefined ? {} : { place });
      assert.deepStrictEqual(listed.result.children, children, at);
      const bound = (children.length + 1) * (shape.height + 1);
      const count = reads(listed, shape);
      assert.ok(count.nodes <= bound, `${at}: ${count.nodes} node reads, bound ${bound}`);
      if (place === 'wing') {
        const fewestLeaves = Math.ceil(under(SORTED, place).length / L);
        assert.ok(bound < fewestLeaves, `${at}: bound ${bound} is not under ${fewestLeaves} leaves`);
      }
    }
  }
});

test('A4: the counter can fail', () => {
  for (const [name, sizes] of Object.entries(palaces)) {
    const palace = sizes[SORTED.length];
    const shape = walk(palace);
    const run = counted(palace);
    for (const round of [1, 2]) {
      const at = `${name}, whole browse ${round}`;
      const browsed = run('browse', {});
      assert.strictEqual(browsed.result.memories.length, SORTED.length, at);
      const read = new Set(browsed.gets);
      assert.deepStrictEqual([...shape.leaves].filter((id) => !read.has(id)), [], `${at}: leaves not counted`);
      assert.ok(reads(browsed, shape).nodes >= 10 * shape.height, `${at}: ${reads(browsed, shape).nodes} node reads`);
    }
  }
});

function measuredWrites(palace, at) {
  const run = counted(palace);
  const other = [];
  const measure = (op, place, check) => {
    const before = walk(palace);
    const done = run(op, op === 'save' ? memoryOf(place) : { place });
    const after = walk(palace);
    const read = reads(done, before);
    const written = writes(done, after);
    check(before.height, read, written, `${at}, ${op} ${place}: reads ${JSON.stringify(read)}, writes ${JSON.stringify(written)}`);
    other.push(`${op} ${read.other}/${written.other}`);
  };
  for (const place of [...NEW_PLACES, palace.places[0]]) {
    measure('save', place, (h, read, written, msg) => {
      assert.ok(read.nodes <= h && written.nodes <= 2 * h + 1, msg);
      assert.ok(read.other <= 2 && written.other <= 2, msg);
    });
  }
  for (const place of NEW_PLACES) {
    measure('forget', place, (h, read, written, msg) => {
      assert.ok(read.nodes <= 2 * h && written.nodes <= 2 * h, msg);
      assert.ok(read.other <= 2 && written.other <= 2, msg);
    });
  }
  return other;
}

test('A5: write bounds', () => {
  for (const [name, sizes] of Object.entries(palaces)) {
    const [small, large] = [SMALL, SORTED.length].map((size) => measuredWrites(sizes[size], `${name} at ${size}`));
    assert.deepStrictEqual(small, large, `${name}: non-node reads/writes per operation at ${SMALL} and ${SORTED.length}`);
  }
});
