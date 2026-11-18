'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { open } = require('./lib/palace.js');
const { acquire } = require('./lib/lock.js');

const PALACE_CLI = path.join(__dirname, 'palace.js');
const PAUSE_LIMIT_MS = 20000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function start(file, args, { env, input = '', timeoutMs = 30000 }) {
  const child = spawn(process.execPath, [file, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => {
      stderr += `\n[test-support] killed after ${timeoutMs} ms`;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, pid: child.pid });
    });
  });
  return { child, done };
}

const cli = (env, args, input = '') =>
  start(PALACE_CLI, args, { env, input: typeof input === 'string' ? input : JSON.stringify(input) }).done;

const support = (env, spec) => start(__filename, [JSON.stringify(spec)], { env });

function envFor(root) {
  const env = {
    PATH: process.env.PATH,
    HOME: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'home', '.config'),
    TMPDIR: path.join(root, 'tmp'),
  };
  for (const dir of [env.XDG_CONFIG_HOME, env.TMPDIR]) fs.mkdirSync(dir, { recursive: true });
  return env;
}

async function waitFor(file, done, timeoutMs = 10000) {
  let exited = null;
  done.then((result) => { exited = result; });
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (exited) throw new Error(`child exited before ${file} appeared: code ${exited.code}, ${exited.stderr}`);
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    yield { full, name: entry.name, isFile: entry.isFile() };
    if (entry.isDirectory()) yield* walk(full);
  }
}

function hashes(dir) {
  const out = {};
  for (const { full, isFile } of walk(dir)) {
    if (isFile) out[path.relative(dir, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return out;
}

function scan(roots, needles) {
  const hits = [];
  for (const root of roots) {
    for (const { full, name, isFile } of walk(root)) {
      const bytes = isFile ? fs.readFileSync(full) : Buffer.alloc(0);
      for (const needle of needles) {
        if (name.includes(needle)) hits.push(`${full}: name holds ${needle}`);
        if (bytes.includes(needle)) hits.push(`${full}: bytes hold ${needle}`);
      }
    }
  }
  return hits;
}

function pauseUntil({ ready, resume }) {
  fs.writeFileSync(ready, '');
  const deadline = Date.now() + PAUSE_LIMIT_MS;
  while (!fs.existsSync(resume)) {
    if (Date.now() > deadline) throw new Error(`resume file ${resume} never appeared`);
    sleep(10);
  }
}

function faultyStore(spec) {
  let mutations = 0;
  const calls = { put: 0, get: 0 };
  const pauseAt = (name) => {
    if (spec.pause && ++calls[name] === spec.pause[name]) pauseUntil(spec.pause);
  };
  return (store) => {
    const wrapped = { ...store };
    for (const name of ['begin', 'put', 'setMeta', 'free', 'end']) {
      wrapped[name] = (...args) => {
        mutations++;
        if (mutations === spec.killAt) process.kill(process.pid, 'SIGKILL');
        if (name === 'put') pauseAt('put');
        return store[name](...args);
      };
    }
    wrapped.get = (id) => {
      pauseAt('get');
      return store.get(id);
    };
    return wrapped;
  };
}

function runSpec(spec) {
  if (spec.startAt) sleep(Math.max(0, spec.startAt - Date.now()));
  if (spec.hold) {
    const lock = acquire(spec.palace, { waitMs: spec.lockWaitMs, command: 'hold' });
    sleep(spec.hold);
    lock.release();
    return { held: true };
  }
  const palace = open({ env: process.env, palace: spec.palace, lockWaitMs: spec.lockWaitMs, wrapStore: faultyStore(spec) });
  try {
    const results = [];
    for (let round = 0; round < (spec.repeat || 1); round++) {
      for (const { op, input } of spec.ops) results.push(palace[op](input));
    }
    return results;
  } finally {
    palace.close();
  }
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runSpec(JSON.parse(process.argv[2])))}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { cli, support, envFor, waitFor, hashes, scan };
