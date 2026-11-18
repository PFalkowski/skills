'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, parseJson } = require('./errors.js');

const RETRY_MS = 10;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const lockFile = (dir) => path.join(dir, 'lock');

function unlinkIfPresent(file) {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function create(file, record) {
  let fd;
  try {
    fd = fs.openSync(file, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  try {
    fs.writeSync(fd, JSON.stringify(record));
  } catch (err) {
    fs.closeSync(fd);
    fs.unlinkSync(file);
    throw err;
  }
  fs.closeSync(fd);
  return true;
}

function readHolder(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    const holder = parseJson(text, file);
    return holder && typeof holder === 'object' ? holder : null;
  } catch {
    return null;
  }
}

function busy(dir, holder) {
  const file = lockFile(dir);
  const who = holder
    ? `is held by memory-palace ${holder.command} (pid ${holder.pid} on host ${holder.host}, since ${holder.started})`
    : 'exists but holds no readable record';
  return new PalaceError(
    `busy: ${file} ${who}. Nothing was changed. If that command is still running, retry later. ` +
      `If it is not running (it was killed, or its machine restarted), run \`unlock --palace ${dir}\` and retry.`,
  );
}

function acquire(dir, { waitMs, command }) {
  const file = lockFile(dir);
  const record = { host: os.hostname(), pid: process.pid, command, started: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') };
  const deadline = Date.now() + waitMs;
  let lastTry = false;
  while (!create(file, record)) {
    if (Date.now() < deadline) {
      sleep(RETRY_MS);
      continue;
    }
    const holder = readHolder(file);
    if (holder !== undefined || lastTry) throw busy(dir, holder);
    lastTry = true;
  }
  return { release: () => unlinkIfPresent(file) };
}

function remove(dir) {
  const holder = readHolder(lockFile(dir));
  if (holder === undefined) return null;
  unlinkIfPresent(lockFile(dir));
  if (!holder) return 'unreadable';
  const { nonce, ...shown } = holder;
  return shown;
}

module.exports = { acquire, remove };
