'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PalaceError } = require('./lib/errors.js');
const { parsePlace, showPlace, rangeOf, childPrefix, checkLimits } = require('./lib/place.js');
const { createTree } = require('./lib/tree.js');

const SEED = 20261118;
const DEFAULTS = { m: 128, L: 32 };

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

function freeze(node) {
  for (const value of Object.values(node)) if (typeof value === 'object' && value !== null) freeze(value);
  return Object.freeze(node);
}

function memoryPalace(shape) {
  const pages = new Map();
  let next = 0;
  let reads = 0;
  const write = (node) => {
    const id = `p${next++}`;
    pages.set(id, freeze(node));
    return id;
  };
  const store = {
    get(id) {
      reads++;
      if (!pages.has(id)) throw new Error(`missing page ${id}`);
      return pages.get(id);
    },
  };
  let root = write({ t: 'l', k: [], v: [] });
  const read = (fn) => {
    reads = 0;
    const out = fn(createTree(store, shape, root));
    return { out, reads };
  };
  const change = (fn) => {
    const tree = createTree(store, shape, root);
    const out = fn(tree);
    const flushed = tree.flush(write);
    for (const id of flushed.freed) pages.delete(id);
    root = flushed.root;
    return out;
  };
  return { pages, read, change, root: () => root };
}

const save = (palace, place, value = { place }) => palace.change((tree) => tree.put(parsePlace(place), value));
const forget = (palace, place) => palace.change((tree) => tree.del(parsePlace(place)));
const browse = (palace, place) => palace.read((tree) => tree.range(...rangeOf(parsePlace(place))));
const places = (entries) => entries.map(([key]) => showPlace(key));
const heightBound = (n, { m, L }) => Math.floor(2 + Math.log(n / (2 * Math.ceil(L / 2))) / Math.log(Math.ceil(m / 2)));

function assertHalfFull(palace, { m, L }, why) {
  for (const [id, node] of palace.pages) {
    if (id === palace.root()) continue;
    const size = node.t === 'l' ? node.k.length : node.c.length;
    const least = node.t === 'l' ? Math.ceil(L / 2) : Math.ceil(m / 2);
    assert.ok(size >= least, `${why}: node ${id} holds ${size}, fewer than ${least}`);
  }
}

test('place: parsePlace refuses each invalid form', () => {
  const cases = [
    ['', /empty segment/],
    ['a//b', /empty segment/],
    ['.', /\. or \.\./],
    ['a/../b', /\. or \.\./],
    ['a/.', /\. or \.\./],
    ['a\u0000b', /control character/],
    ['a/b\u001f', /control character/],
    ['a\u007fb', /control character/],
    ['/a', /start or end with \//],
    ['a/', /start or end with \//],
  ];
  for (const [place, rule] of cases) {
    assert.throws(() => parsePlace(place), (err) => err instanceof PalaceError && rule.test(err.message), JSON.stringify(place));
  }
});

test('place: NFC and NFD spellings give one key', () => {
  assert.strictEqual(parsePlace('wing/café'), parsePlace('wing/café'));
  assert.strictEqual(showPlace(parsePlace('wing/café')), 'wing/café');
});

test('place: checkLimits names the field and the limit', () => {
  const memory = { place: 'wing/room', title: 't', summary: 's', text: 'x', kind: 'note' };
  checkLimits({
    ...memory,
    place: `${'a/'.repeat(15)}${'b'.repeat(256 - 30)}`,
    title: 'é'.repeat(120),
    summary: 's'.repeat(400),
    text: 'x'.repeat(32000),
    kind: 'k'.repeat(32),
  });
  const over = [
    [{ place: 'a'.repeat(257) }, /place.*256/],
    [{ place: `${'a/'.repeat(16)}a` }, /place.*16/],
    [{ title: 't'.repeat(121) }, /title.*120/],
    [{ summary: 's'.repeat(401) }, /summary.*400/],
    [{ text: 'x'.repeat(32001) }, /text.*32,?000/],
    [{ kind: 'k'.repeat(33) }, /kind.*32/],
  ];
  for (const [field, rule] of over) {
    assert.throws(() => checkLimits({ ...memory, ...field }), (err) => err instanceof PalaceError && rule.test(err.message), Object.keys(field)[0]);
  }
});

const SIBLINGS = ['wing/room', 'wing/room/x', 'wing/room 3/y', 'wing/room-2/a', 'wing/room.old/x'];

test('order: siblings stay out of a place\'s range', () => {
  const palace = memoryPalace({ m: 4, L: 4 });
  for (const place of [...SIBLINGS].reverse()) save(palace, place);
  for (let i = 0; i < 20; i++) save(palace, `wing/room 3/f${i}`);
  assert.deepStrictEqual(places(browse(palace, 'wing/room').out), ['wing/room', 'wing/room/x']);
});

test('order: children lists each child once, in place order', () => {
  const palace = memoryPalace({ m: 4, L: 4 });
  for (const place of SIBLINGS) save(palace, place);
  for (let i = 0; i < 20; i++) save(palace, `wing/room/f${i}`);
  const wing = parsePlace('wing');
  const { out } = palace.read((tree) => tree.children(childPrefix(wing), rangeOf(wing)[1]));
  assert.deepStrictEqual(out, ['room', 'room 3', 'room-2', 'room.old']);
});

test('tree: fuzz against a reference set at m/L 4/4, 5/3 and 3/3', () => {
  for (const shape of [{ m: 4, L: 4 }, { m: 5, L: 3 }, { m: 3, L: 3 }]) {
    const random = mulberry32(SEED + shape.m * 10 + shape.L);
    const segments = ['a', 'b', 'a b', 'a-b', 'a.b', 'ab', 'café', 'z'];
    const pick = (list) => list[Math.floor(random() * list.length)];
    const randomPlace = () => Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(segments)).join('/');
    const palace = memoryPalace(shape);
    const reference = new Map();
    const sorted = () => [...reference.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (let i = 1; i <= 3000; i++) {
      const at = `seed ${SEED}, m/L ${shape.m}/${shape.L}, op ${i}`;
      const place = randomPlace();
      const key = parsePlace(place);
      if (random() < 0.55) {
        const value = { place, i };
        assert.deepStrictEqual(save(palace, place, value), reference.get(key), at);
        reference.set(key, value);
      } else {
        assert.deepStrictEqual(forget(palace, place), reference.get(key), at);
        reference.delete(key);
      }
      if (i % 50 !== 0) continue;
      const stats = palace.read((tree) => tree.check()).out;
      assert.strictEqual(stats.count, reference.size, at);
      assert.deepStrictEqual([...stats.ids].sort(), [...palace.pages.keys()].sort(), at);
      assertHalfFull(palace, shape, at);
      assert.deepStrictEqual(palace.read((tree) => tree.range()).out, sorted(), at);
      const probe = parsePlace(randomPlace());
      const under = sorted().filter(([k]) => k === probe || k.startsWith(`${probe}\0`));
      assert.deepStrictEqual(palace.read((tree) => tree.range(...rangeOf(probe))).out, under, at);
      const childNames = (prefix) => [...new Set(sorted().filter(([k]) => k.startsWith(prefix)).map(([k]) => k.slice(prefix.length).split('\0')[0]))];
      assert.deepStrictEqual(palace.read((tree) => tree.children(childPrefix(probe), rangeOf(probe)[1])).out, childNames(`${probe}\0`), at);
      assert.deepStrictEqual(palace.read((tree) => tree.children('', null)).out, childNames(''), at);
      assert.deepStrictEqual(palace.read((tree) => tree.get(probe)).out, reference.get(probe), at);
    }
  }
});

test('tree: forget is exact', () => {
  const palace = memoryPalace({ m: 4, L: 4 });
  for (const place of ['p', 'p/x', 'p/x/y']) save(palace, place);
  assert.deepStrictEqual(forget(palace, 'p'), { place: 'p' });
  assert.strictEqual(palace.read((tree) => tree.get(parsePlace('p'))).out, undefined);
  assert.deepStrictEqual(palace.read((tree) => tree.get(parsePlace('p/x'))).out, { place: 'p/x' });
  assert.deepStrictEqual(palace.read((tree) => tree.get(parsePlace('p/x/y'))).out, { place: 'p/x/y' });
  assert.deepStrictEqual(places(browse(palace, 'p').out), ['p/x', 'p/x/y']);
});

function churn(placeOf) {
  const palace = memoryPalace(DEFAULTS);
  const live = [];
  for (let i = 0; i < 10000; i++) {
    const place = placeOf(i);
    save(palace, place);
    live.push(place);
    if (i >= 100) forget(palace, live.shift());
  }
  const f = Math.ceil(DEFAULTS.L / 2);
  const { height } = palace.read((tree) => tree.check()).out;
  assert.ok(height <= heightBound(100, DEFAULTS), `height ${height} over the bound for N = 100`);
  assertHalfFull(palace, DEFAULTS, 'after churn');
  for (const place of live) {
    const { out, reads } = palace.read((tree) => tree.get(parsePlace(place)));
    assert.deepStrictEqual(out, { place }, place);
    assert.ok(reads <= height, `lookup of ${place} read ${reads} nodes, height ${height}`);
  }
  const { out, reads } = browse(palace, 'log');
  assert.deepStrictEqual(places(out), [...live].sort((a, b) => (parsePlace(a) < parsePlace(b) ? -1 : 1)));
  assert.ok(reads <= height + Math.ceil(100 / f) + 3, `browse read ${reads} nodes`);
  assert.ok(palace.pages.size <= 2 * Math.ceil(100 / f) + 1, `${palace.pages.size} nodes stored`);
}

test('A6: churn with dated places', () => {
  const start = Date.UTC(2026, 0, 1);
  churn((i) => `log/${new Date(start + i * 60000).toISOString()}`);
});

test('A6: churn with random places', () => {
  const random = mulberry32(SEED);
  const word = () => Math.floor(random() * 36 ** 6).toString(36);
  churn(() => `log/${word().slice(0, 2)}/${word()}`);
});

test('A6: forgetting all 500 of one place', () => {
  const palace = memoryPalace(DEFAULTS);
  const room = Array.from({ length: 500 }, (_, i) => `wing/room/m${i}`);
  for (const place of room) save(palace, place);
  for (const sibling of ['room 3', 'room-2', 'room.old']) for (let i = 0; i < 200; i++) save(palace, `wing/${sibling}/m${i}`);
  for (let i = 0; i < 1000; i++) save(palace, `filler/f${i}`);
  for (const place of room) forget(palace, place);
  const { height, count } = palace.read((tree) => tree.check()).out;
  assert.strictEqual(count, 1600);
  assertHalfFull(palace, DEFAULTS, 'after mass forget');
  const { out, reads } = browse(palace, 'wing/room');
  assert.deepStrictEqual(out, []);
  assert.ok(reads <= height + 3, `browse read ${reads} nodes, height ${height}`);
});

const treeOf = (pages, shape = DEFAULTS) => createTree({ get: (id) => pages[id] }, shape, 'root');
const INTEGRITY = /integrity check failed: /;

test('tree: a node reached twice ends range and check with the integrity error', () => {
  const pages = { root: { t: 'i', k: ['m'], c: ['x', 'x'] }, x: { t: 'l', k: ['n'], v: [1] } };
  assert.throws(() => treeOf(pages).range(), INTEGRITY);
  const loop = { root: { t: 'i', k: ['m'], c: ['leaf', 'root'] }, leaf: { t: 'l', k: ['a'], v: [1] } };
  assert.throws(() => treeOf(loop, { m: 3, L: 2 }).check(), /node root is reached twice/);
});

test('tree: a chain deeper than any real tree ends every walk with the integrity error', () => {
  const pages = { root: { t: 'i', k: ['b'], c: ['n0', 'leaf'] }, leaf: { t: 'l', k: [], v: [] } };
  for (let i = 0; i < 64; i++) pages[`n${i}`] = { t: 'i', k: ['a'], c: [`n${i + 1}`, 'leaf'] };
  pages.n64 = { t: 'l', k: [], v: [] };
  for (const walk of [(t) => t.get(''), (t) => t.put('', 1), (t) => t.range('', 'a'), (t) => t.children('', 'a')]) {
    assert.throws(() => walk(treeOf(pages, { m: 3, L: 2 })), /deeper than 54 levels/);
  }
});
