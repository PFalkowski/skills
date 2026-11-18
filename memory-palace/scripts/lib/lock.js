'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError, parseJson } = require('./errors.js');

const RETRY_MS = 10;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const lockFile = (dir) => path.join(dir, 'lock');
const SIGNALS = ['SIGINT', 'SIGTERM'];
const letTheCommandFinish = () => {};
const LOCK_REMOVED = 'the lock was removed while this command ran (unlock, or the file was deleted). This command stopped before changing anything else. Retry.';
const LOCK_LOST = 'the lock was removed while this command held it (unlock, or the file was deleted), so another command may have run at the same time. Run check.';

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

const COMMANDS = new Set(['setup', 'save', 'recall', 'browse', 'list', 'forget', 'sync', 'remote', 'check']);
const wellFormed = ({ host, pid, command, started }) =>
  Number.isInteger(pid) && COMMANDS.has(command) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(started) && typeof host === 'string' && /^[\w.-]{1,64}$/.test(host);

function busy(dir, holder) {
  const file = lockFile(dir);
  const who = holder && wellFormed(holder)
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
  while (!create(file, record)) {
    if (Date.now() >= deadline) throw busy(dir, readHolder(file));
    sleep(RETRY_MS);
  }
  const owned = () => readHolder(file)?.nonce === record.nonce;
  function release() {
    for (const signal of SIGNALS) process.removeListener(signal, letTheCommandFinish);
    if (!owned()) return LOCK_LOST;
    fs.rmSync(file, { force: true });
    return undefined;
  }
  for (const signal of SIGNALS) process.once(signal, letTheCommandFinish);
  return {
    owned,
    check: () => {
      if (!owned()) throw new PalaceError(LOCK_REMOVED);
    },
    release,
  };
}

function remove(dir) {
  const holder = readHolder(lockFile(dir));
  if (holder === undefined) return null;
  fs.rmSync(lockFile(dir), { force: true });
  if (!holder || !wellFormed(holder)) return 'unreadable';
  const { host, pid, command, started } = holder;
  return { host, pid, command, started };
}

module.exports = { acquire, remove, sleep };
