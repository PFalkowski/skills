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
    root = own(root);
    const path = [];
    let node = root;
    while (node.t === 'i') {
      const i = childIndex(node.k, key);
      node.c[i] = own(node.c[i]);
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
    let node = load(root);
    while (node.t === 'i') node = load(node.c[childIndex(node.k, key)]);
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
    const visit = (ref) => {
      const node = load(ref);
      if (node.t === 'l') {
        for (let j = lowerBound(node.k, lo); j < node.k.length && (hi === null || node.k[j] < hi); j++) found.push([node.k[j], node.v[j]]);
        return;
      }
      const last = hi === null ? node.c.length - 1 : lowerBound(node.k, hi);
      for (let i = childIndex(node.k, lo); i <= last; i++) visit(node.c[i]);
    };
    visit(root);
    return found;
  }

  function first(lo, hi) {
    const seek = (ref) => {
      const node = load(ref);
      if (node.t === 'l') return node.k[lowerBound(node.k, lo)];
      for (let i = childIndex(node.k, lo); i < node.c.length; i++) {
        const key = seek(node.c[i]);
        if (key !== undefined || (hi !== null && node.k[i] >= hi)) return key;
      }
      return undefined;
    };
    const key = seek(root);
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
    const walk = (ref, lo, hi, depth) => {
      const node = load(ref);
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
      node.c.forEach((child, i) => walk(child, i === 0 ? lo : node.k[i - 1], i === node.k.length ? hi : node.k[i], depth + 1));
    };
    walk(root, null, null, 1);
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
