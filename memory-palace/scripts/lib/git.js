'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PalaceError } = require('./errors.js');

const DROPPED_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE',
];
const OWNED = ['palace.json', 'meta', path.join('pages', '00', '0'), 'palace.db', '.gitignore'];
const OWNED_PATHS = ['palace.json', 'meta', 'pages', '.gitignore'];
const OWNED_FILE = /^(palace\.json|meta|\.gitignore|pages\/[0-9a-f]{2}\/[0-9a-f]{32})$/;
const CONFINED = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false',
  '-c', 'gc.autoDetach=false', '-c', 'user.name=memory-palace', '-c', 'user.email=memory-palace@localhost', '-c', 'core.fsmonitor=false',
];
const WRITTEN_KEYS = new Set([
  'core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.symlinks', 'core.ignorecase', 'core.precomposeunicode',
  'extensions.objectformat', 'extensions.refstorage', 'remote.origin.url', 'remote.origin.fetch', 'branch.main.remote', 'branch.main.merge',
]);
const LOCAL_TIMEOUT_MS = 120000;
const STALE_LOCK_MS = 10000;

const NOT_EMPTY = 'the remote is not empty. To open the palace it holds, use join. Otherwise create an empty repository (no README, license or .gitignore) and try again. Nothing was written.';
const DIVERGED = 'this palace and its remote have both changed since they last matched. Nothing was changed. To keep working, join a fresh copy into a new folder (`join --palace <new folder>`). This folder is left as it is and keeps the memories that were not synced.';

function scrubbed(env) {
  const clean = { ...env };
  for (const name of DROPPED_VARIABLES) delete clean[name];
  return clean;
}

function git(env, args, { timeoutMs, repo } = {}) {
  const confined = repo && { GIT_DIR: path.join(repo, '.git'), GIT_WORK_TREE: repo };
  const result = spawnSync('git', args, { env: { ...scrubbed(env), GIT_TERMINAL_PROMPT: '0', ...confined }, cwd: repo, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error?.code === 'ETIMEDOUT') throw new PalaceError(`git ${args.find((arg) => !arg.startsWith('-') && !arg.includes('='))} timed out after ${timeoutMs / 1000} s`);
  if (result.error) throw result.error;
  return result;
}

function run(env, repo, args, { timeoutMs = LOCAL_TIMEOUT_MS, allow = [0] } = {}) {
  const result = git(env, [...CONFINED, ...args], { timeoutMs, repo });
  if (!allow.includes(result.status)) throw new PalaceError(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result;
}

function checkOwner(file) {
  const owner = fs.statSync(file, { throwIfNoEntry: false })?.uid;
  if (process.getuid && owner !== undefined && owner !== process.getuid()) {
    throw new PalaceError(`${file} is not owned by the current user, so memory-palace will not run git on it. Nothing was changed.`);
  }
}

function online(env, palace) {
  const dir = path.join(palace, '.git');
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return false;
  checkOwner(dir);
  checkOwner(path.join(dir, 'config'));
  const keys = run(env, palace, ['config', '--local', '--list', '-z']).stdout.split('\0').map((entry) => entry.split('\n')[0]);
  const foreign = keys.find((key) => key && !WRITTEN_KEYS.has(key));
  if (foreign) {
    throw new PalaceError(`${path.join(dir, 'config')} sets ${JSON.stringify(foreign)}, which memory-palace did not write. Remove it, then retry. Nothing was changed.`);
  }
  return true;
}

const init = (env, dir) => run(env, undefined, ['init', '-q', '-b', 'main', dir]);

const clone = (env, url, dir, timeoutMs) => run(env, undefined, ['clone', '-q', '--branch', 'main', '--', url, dir], { timeoutMs });

function revision(env, palace, rev) {
  const result = run(env, palace, ['rev-parse', '--verify', '-q', `${rev}^{commit}`], { allow: [0, 1] });
  return result.status === 0 ? result.stdout.trim() : null;
}

const isAncestor = (env, palace, older, newer) => run(env, palace, ['merge-base', '--is-ancestor', older, newer], { allow: [0, 1] }).status === 0;

function originUrl(env, palace) {
  const result = run(env, palace, ['config', '--get', 'remote.origin.url'], { allow: [0, 1] });
  return result.status === 0 ? result.stdout.trim() : null;
}

function setOrigin(env, palace, url) {
  const current = originUrl(env, palace);
  if (current === url) return;
  if (current !== null) run(env, palace, ['remote', 'remove', 'origin']);
  run(env, palace, ['remote', 'add', '--', 'origin', url]);
}

function foreignPaths(env, palace, rev) {
  return run(env, palace, ['ls-tree', '-r', '--name-only', '-z', rev]).stdout.split('\0').filter((file) => file && !OWNED_FILE.test(file));
}

function foreignError(paths, next) {
  const more = paths.length > 1 ? ` (and ${paths.length - 1} more)` : '';
  const first = paths[0].length > 80 ? `${paths[0].slice(0, 80)}...` : paths[0];
  return new PalaceError(`the remote holds files memory-palace did not write: ${JSON.stringify(first)}${more}. ${next}`);
}

function refuseForeignHead(env, palace) {
  if (revision(env, palace, 'HEAD') === null) return;
  const foreign = foreignPaths(env, palace, 'HEAD');
  if (foreign.length > 0) throw foreignError(foreign, 'Nothing was changed. Remove them from the remote and from this folder, then retry.');
}

function checkRemote(env, palace, url, timeoutMs) {
  const listed = run(env, undefined, ['ls-remote', '--', url, 'refs/heads/main'], { timeoutMs });
  if (listed.stdout.trim() === '') return;
  if (palace === null) throw new PalaceError(NOT_EMPTY);
  run(env, palace, ['fetch', '-q', '--', url, 'refs/heads/main'], { timeoutMs });
  const foreign = foreignPaths(env, palace, 'FETCH_HEAD');
  if (foreign.length > 0) throw foreignError(foreign, 'Nothing was changed. Remove them from the remote, then try again.');
  const head = revision(env, palace, 'HEAD');
  const fetched = revision(env, palace, 'FETCH_HEAD');
  if (head === null || !(isAncestor(env, palace, head, fetched) || isAncestor(env, palace, fetched, head))) throw new PalaceError(NOT_EMPTY);
}

function fetchAndForward(env, palace, { timeoutMs, read, checkLock, checkSettings }) {
  let warning;
  try {
    run(env, palace, ['fetch', '-q', '--prune', 'origin'], { timeoutMs });
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    warning = err.message;
  }
  const upstream = revision(env, palace, 'refs/remotes/origin/main');
  const head = revision(env, palace, 'HEAD');
  if (upstream === null || upstream === head || isAncestor(env, palace, upstream, head)) return { warning };
  if (!isAncestor(env, palace, head, upstream)) throw new PalaceError(DIVERGED);
  checkLock();
  const foreign = foreignPaths(env, palace, upstream);
  if (foreign.length === 0) {
    checkSettings(run(env, palace, ['cat-file', 'blob', `${upstream}:palace.json`]).stdout);
    run(env, palace, ['merge', '-q', '--ff-only', upstream]);
    return { warning };
  }
  if (!read) throw foreignError(foreign, 'Nothing was merged. Remove them from the remote, then sync again.');
  return { warning: [warning, foreignError(foreign, 'Nothing was merged; this answer comes from the local copy.').message].filter(Boolean).join(' ') };
}

function commit(env, palace) {
  run(env, palace, ['add', '-A', '--', ...OWNED_PATHS]);
  if (run(env, palace, ['diff', '--cached', '--quiet'], { allow: [0, 1] }).status === 1) run(env, palace, ['commit', '-q', '-m', 'memory-palace']);
}

function* gitLocks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'objects') yield* gitLocks(full);
    else if (entry.isFile() && entry.name.endsWith('.lock')) yield full;
  }
}

function clearStaleLocks(palace) {
  for (const file of gitLocks(path.join(palace, '.git'))) {
    const age = Date.now() - (fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0);
    if (age < STALE_LOCK_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, STALE_LOCK_MS - age);
    fs.rmSync(file, { force: true });
  }
}

function restore(env, palace) {
  if (revision(env, palace, 'HEAD') === null) {
    commit(env, palace);
  } else if (run(env, palace, ['status', '--porcelain', '--', ...OWNED_PATHS]).stdout !== '') {
    refuseForeignHead(env, palace);
    run(env, palace, ['reset', '-q', '--hard', 'HEAD']);
    run(env, palace, ['clean', '-q', '-fd', '--', 'pages']);
  }
}

const push = (env, palace, timeoutMs) => run(env, palace, ['push', '-q', 'origin', 'HEAD:refs/heads/main'], { timeoutMs });

function gc(env, palace) {
  try {
    run(env, palace, ['gc', '--auto', '--quiet']);
    return undefined;
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    return err.message;
  }
}

function carriesSecret(url) {
  if (url.includes('::')) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.password !== '' || parsed.search !== '' || parsed.hash !== '' || (/^https?:$/.test(parsed.protocol) && parsed.username !== '');
}

function hasGitAbove(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, '.git'))) return true;
    if (at === path.dirname(at)) return false;
  }
}

function enclosingRepo(target, env) {
  const parent = path.dirname(target);
  let config;
  try {
    config = git(env, ['-C', parent, 'config', '--list']);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (config.status !== 0) {
    throw new PalaceError(`git could not read its configuration, so memory-palace cannot tell whether ${target} is inside a git repository: ${config.stderr.trim()}. Nothing was written.`);
  }
  const toplevel = git(env, ['-C', parent, 'rev-parse', '--show-toplevel']);
  if (toplevel.status === 128 && !hasGitAbove(parent)) return null;
  if (toplevel.status !== 0) {
    throw new PalaceError(`git could not tell whether ${target} is inside a git repository: ${toplevel.stderr.trim()}. Nothing was written.`);
  }
  const top = toplevel.stdout.trim();
  const ignored = git(env, ['-C', top, 'check-ignore', '--', ...OWNED.map((owned) => path.join(target, owned))]);
  if (ignored.status !== 0 && ignored.status !== 1) throw new PalaceError(`git check-ignore failed in ${top}: ${ignored.stderr.trim()}. Nothing was written.`);
  return { top, allIgnored: ignored.stdout.split('\n').filter(Boolean).length === OWNED.length };
}

module.exports = {
  online, init, clone, originUrl, setOrigin, foreignPaths, foreignError, refuseForeignHead, checkRemote, fetchAndForward, clearStaleLocks, restore, commit, push, gc,
  carriesSecret, enclosingRepo,
};
