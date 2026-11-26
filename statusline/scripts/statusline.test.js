const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const { place, compact } = require('./statusline.js');

const plain = (s) => (s === null ? null : s.replace(/\x1b\[[0-9;]*m/g, ''));
const NO_DOCKERENV = '/nonexistent/.dockerenv';

test('a dev container is named from DEV_CONTAINER, without the dev_ prefix', () => {
  assert.match(plain(place({ DEV_CONTAINER: 'dev_PFalkowski_XtbClient' }, NO_DOCKERENV)), /PFalkowski_XtbClient$/);
});

test('a container started without DEV_CONTAINER falls back to its hostname', () => {
  assert.match(plain(place({}, __filename)), new RegExp(`${os.hostname()}$`));
});

test('the host is tagged only when the warning is opted into', () => {
  assert.strictEqual(place({}, NO_DOCKERENV), null);
  assert.match(plain(place({ CLAUDE_STATUSLINE_HOST_WARNING: '1' }, NO_DOCKERENV)), /HOST /);
});

test('the container wins over a host warning inherited into it', () => {
  const out = plain(place({ DEV_CONTAINER: 'dev_x', CLAUDE_STATUSLINE_HOST_WARNING: '1' }, NO_DOCKERENV));
  assert.doesNotMatch(out, /HOST/);
});

test('compact picks the unit after rounding', () => {
  assert.strictEqual(compact(999), '999');
  assert.strictEqual(compact(999499), '999k');
  assert.strictEqual(compact(999500), '1M');
  assert.strictEqual(compact(999999), '1M');
  assert.strictEqual(compact(1000000), '1M');
});

test('compact keeps the k side of its boundary exact', () => {
  assert.strictEqual(compact(1000), '1k');
  assert.strictEqual(compact(99949), '99.9k');
  assert.strictEqual(compact(99950), '100k');
});
