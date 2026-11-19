'use strict';

const { PalaceError } = require('./errors.js');

function lowerBound(keys, key) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function childIndex(separators, key) {
  const i = lowerBound(separators, key);
  return separators[i] === key ? i + 1 : i;
}

const isStored = (ref) => typeof ref === 'string';
const copy = (node) => (node.t === 'l' ? { t: 'l', k: [...node.k], v: [...node.v] } : { t: 'i', k: [...node.k], c: [...node.c] });
const combine = (left, separator, right) =>
  left.t === 'l'
    ? { t: 'l', k: [...left.k, ...right.k], v: [...left.v, ...right.v] }
    : { t: 'i', k: [...left.k, separator, ...right.k], c: [...left.c, ...right.c] };

function createTree(pages, { m, L }, rootId) {
  const cache = new Map();
  const freed = [];
  let root = rootId;

  const size = (node) => (node.t === 'l' ? node.k.length : node.c.length);
  const most = (node) => (node.t === 'l' ? L : m);
  const least = (node) => Math.ceil(most(node) / 2);
  const tallest = 2 + Math.ceil(Math.log2(Number.MAX_SAFE_INTEGER / 2) / Math.log2(Math.ceil(m / 2)));

  function walk() {
    const seen = new Set();
    return (ref, depth) => {
      if (depth > tallest) throw new PalaceError(`integrity check failed: the tree is deeper than ${tallest} levels`);
      if (isStored(ref)) {
        if (seen.has(ref)) throw new PalaceError(`integrity check failed: node ${ref} is reached twice`);
        seen.add(ref);
      }
      return ref;
    };
  }

  function load(ref) {
    if (!isStored(ref)) return ref;
    if (!cache.has(ref)) cache.set(ref, pages.get(ref));
    return cache.get(ref);
  }

  function take(ref) {
    if (isStored(ref)) freed.push(ref);
    return load(ref);
  }

  const own = (ref) => (isStored(ref) ? copy(take(ref)) : ref);

  function splitIfOver(node) {
    if (size(node) <= most(node)) return null;
    const mid = Math.ceil(size(node) / 2);
    if (node.t === 'l') {
      const right = { t: 'l', k: node.k.splice(mid), v: node.v.splice(mid) };
      return { separator: right.k[0], right };
    }
    const right = { t: 'i', k: node.k.splice(mid), c: node.c.splice(mid) };
    return { separator: node.k.pop(), right };
  }

  function ownPath(key) {
    const reach = walk();
    root = own(reach(root, 1));
    const path = [];
    let node = root;
    while (node.t === 'i') {
      const i = childIndex(node.k, key);
      node.c[i] = own(reach(node.c[i], path.length + 2));
      path.push([node, i]);
      node = node.c[i];
    }
    return { path, leaf: node };
  }

  function rebalance(parent, i) {
    const li = i > 0 ? i - 1 : i;
    const merged = combine(take(parent.c[li]), parent.k[li], take(parent.c[li + 1]));
    const split = splitIfOver(merged);
    if (split) {
      parent.k[li] = split.separator;
      parent.c.splice(li, 2, merged, split.right);
    } else {
      parent.k.splice(li, 1);
      parent.c.splice(li, 2, merged);
    }
  }

  function get(key) {
    const reach = walk();
    let node = load(reach(root, 1));
    for (let depth = 2; node.t === 'i'; depth++) node = load(reach(node.c[childIndex(node.k, key)], depth));
    const j = lowerBound(node.k, key);
    return node.k[j] === key ? node.v[j] : undefined;
  }

  function put(key, value) {
    const { path, leaf } = ownPath(key);
    const j = lowerBound(leaf.k, key);
    if (leaf.k[j] === key) {
      const old = leaf.v[j];
      leaf.v[j] = value;
      return old;
    }
    leaf.k.splice(j, 0, key);
    leaf.v.splice(j, 0, value);
    let split = splitIfOver(leaf);
    while (split && path.length) {
      const [parent, i] = path.pop();
      parent.k.splice(i, 0, split.separator);
      parent.c.splice(i + 1, 0, split.right);
      split = splitIfOver(parent);
    }
    if (split) root = { t: 'i', k: [split.separator], c: [root, split.right] };
    return undefined;
  }

  function del(key) {
    if (get(key) === undefined) return undefined;
    const { path, leaf } = ownPath(key);
    const j = lowerBound(leaf.k, key);
    const [old] = leaf.v.splice(j, 1);
    leaf.k.splice(j, 1);
    while (path.length) {
      const [parent, i] = path.pop();
      if (size(parent.c[i]) >= least(parent.c[i])) break;
      rebalance(parent, i);
    }
    if (root.t === 'i' && root.c.length === 1) root = root.c[0];
    return old;
  }

  function range(lo = '', hi = null) {
    const found = [];
    const reach = walk();
    const visit = (ref, depth) => {
      const node = load(reach(ref, depth));
      if (node.t === 'l') {
        for (let j = lowerBound(node.k, lo); j < node.k.length && (hi === null || node.k[j] < hi); j++) found.push([node.k[j], node.v[j]]);
        return;
      }
      const last = hi === null ? node.c.length - 1 : lowerBound(node.k, hi);
      for (let i = childIndex(node.k, lo); i <= last; i++) visit(node.c[i], depth + 1);
    };
    visit(root, 1);
    return found;
  }

  function first(lo, hi) {
    const reach = walk();
    const seek = (ref, depth) => {
      const node = load(reach(ref, depth));
      if (node.t === 'l') return node.k[lowerBound(node.k, lo)];
      for (let i = childIndex(node.k, lo); i < node.c.length; i++) {
        const key = seek(node.c[i], depth + 1);
        if (key !== undefined || (hi !== null && node.k[i] >= hi)) return key;
      }
      return undefined;
    };
    const key = seek(root, 1);
    return key !== undefined && (hi === null || key < hi) ? key : undefined;
  }

  function children(prefix, hi) {
    const names = [];
    for (let key = first(prefix, hi); key !== undefined; key = first(`${prefix}${names.at(-1)}\u0001`, hi)) {
      names.push(key.slice(prefix.length).split('\0')[0]);
    }
    return names;
  }

  function check() {
    const ids = [];
    const leafDepths = new Set();
    let count = 0;
    const reach = walk();
    const visit = (ref, lo, hi, depth) => {
      const node = load(reach(ref, depth));
      const fail = (what) => {
        throw new PalaceError(`integrity check failed: ${what} in node ${isStored(ref) ? ref : '(unsaved)'}`);
      };
      if (isStored(ref)) ids.push(ref);
      if (size(node) > most(node)) fail('too many entries');
      if (ref !== root && size(node) < least(node)) fail('too few entries');
      for (let j = 0; j < node.k.length; j++) {
        if (j > 0 && node.k[j - 1] >= node.k[j]) fail('keys out of order');
        if ((lo !== null && node.k[j] < lo) || (hi !== null && node.k[j] >= hi)) fail('a key outside its separators');
      }
      if (node.t === 'l') {
        leafDepths.add(depth);
        count += node.k.length;
        return;
      }
      if (node.c.length !== node.k.length + 1 || node.c.length < 2) fail('children and separators do not match');
      node.c.forEach((child, i) => visit(child, i === 0 ? lo : node.k[i - 1], i === node.k.length ? hi : node.k[i], depth + 1));
    };
    visit(root, null, null, 1);
    if (leafDepths.size !== 1) throw new PalaceError('integrity check failed: leaves at different depths');
    return { height: [...leafDepths][0], nodes: ids.length, count, ids };
  }

  function flush(write) {
    const store = (ref) => (isStored(ref) ? ref : write(ref.t === 'l' ? ref : { ...ref, c: ref.c.map(store) }));
    root = store(root);
    return { root, freed };
  }

  return { get, put, del, range, children, check, flush };
}

module.exports = { createTree };
