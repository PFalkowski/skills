'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PalaceError } = require('./errors.js');
const { sleep } = require('./lock.js');

const DROPPED_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE',
];
const OWNED = ['palace.json', 'meta', path.join('pages', '00', '0'), '.gitignore'];
const OWNED_PATHS = ['palace.json', 'meta', 'pages', '.gitignore'];
const OWNED_FILE = /^(palace\.json|meta|\.gitignore|pages\/[0-9a-f]{2}\/[0-9a-f]{32})$/;
const CONFINED = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false',
  '-c', 'gc.autoDetach=false', '-c', 'user.name=memory-palace', '-c', 'user.email=memory-palace@localhost', '-c', 'core.fsmonitor=false',
];
const WRITTEN_KEYS = new Set([
  'core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.symlinks', 'core.ignorecase', 'core.precomposeunicode',
  'extensions.objectformat', 'extensions.refstorage',
]);
const LINK = /^(remote|branch)\./;
const TRACKING = 'refs/remotes/origin/main';
const LOCAL_TIMEOUT_MS = 120000;
const STALE_LOCK_MS = 10000;
const PROJECT_ROOT_MS = 5000;

const NOT_EMPTY = 'the remote is not empty. To open the palace it holds, use join. Otherwise create an empty repository (no README, license or .gitignore) and try again. Nothing was written.';
const SECRET_URL = 'the remote URL carries a password or token. Use a credential helper or ssh. Nothing was written.';
const DIVERGED = 'this palace and its remote have both changed since they last matched. Nothing was changed. Reads still answer from this folder. To save again, follow the steps under \'this palace and its remote have both changed\' in the skill\'s SKILL.md.';
const DIVERGED_READ = 'this palace and its remote have both changed since they last matched. This answer comes from the local copy, which may lack memories saved elsewhere. Saves and sync stop until the two are brought together: follow the steps under \'this palace and its remote have both changed\' in the skill\'s SKILL.md.';

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

const configKeys = (env, palace) => run(env, palace, ['config', '--local', '--name-only', '--list', '-z']).stdout.split('\0').filter(Boolean);

const hasRepo = (palace) => fs.statSync(path.join(palace, '.git'), { throwIfNoEntry: false })?.isDirectory() ?? false;

function online(env, palace, joinRemote) {
  const dir = path.join(palace, '.git');
  if (!hasRepo(palace)) return false;
  checkOwner(dir);
  const config = path.join(dir, 'config');
  checkOwner(config);
  const legacy = ['remotes', 'branches'].map((name) => path.join(dir, name))
    .find((file) => fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() && fs.readdirSync(file).length > 0);
  if (legacy) throw new PalaceError(`${legacy} holds files memory-palace did not write, and git reads remotes from them. Remove it, then retry. Nothing was changed.`);
  const foreign = configKeys(env, palace).filter((key) => !WRITTEN_KEYS.has(key));
  const other = foreign.find((key) => !joinRemote || !LINK.test(key));
  if (other) throw new PalaceError(`${config} sets ${JSON.stringify(other)}, which memory-palace did not write. Remove it, then retry. Nothing was changed.`);
  return true;
}

function unlink(env, palace) {
  const sections = new Set(configKeys(env, palace).filter((key) => LINK.test(key)).map((key) => key.slice(0, key.lastIndexOf('.'))));
  for (const section of sections) run(env, palace, ['config', '--local', '--remove-section', section]);
}

const init = (env, dir) => run(env, undefined, ['init', '-q', '-b', 'main', dir]);

function clone(env, url, dir, timeoutMs) {
  run(env, undefined, ['clone', '-q', '--branch', 'main', '--', url, dir], { timeoutMs });
  unlink(env, dir);
}

function revision(env, palace, rev) {
  const result = run(env, palace, ['rev-parse', '--verify', '-q', `${rev}^{commit}`], { allow: [0, 1] });
  return result.status === 0 ? result.stdout.trim() : null;
}

const isAncestor = (env, palace, older, newer) => run(env, palace, ['merge-base', '--is-ancestor', older, newer], { allow: [0, 1] }).status === 0;

const dropTracking = (env, palace) => run(env, palace, ['update-ref', '-d', TRACKING]);

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

function fetchAndForward(env, palace, url, { timeoutMs, read, checkLock, checkSettings }) {
  let warning;
  try {
    run(env, palace, ['fetch', '-q', '--prune', '--', url, '+refs/heads/*:refs/remotes/origin/*'], { timeoutMs });
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
    warning = err.message;
  }
  const upstream = revision(env, palace, TRACKING);
  const head = revision(env, palace, 'HEAD');
  if (upstream === null || upstream === head || isAncestor(env, palace, upstream, head)) return { warning };
  if (!isAncestor(env, palace, head, upstream)) {
    if (!read) throw new PalaceError(DIVERGED);
    return { warning: [warning, DIVERGED_READ].filter(Boolean).join(' ') };
  }
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
    if (age < STALE_LOCK_MS) sleep(STALE_LOCK_MS - age);
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

const push = (env, palace, url, timeoutMs) => run(env, palace, ['push', '-q', '--', url, 'refs/heads/main:refs/heads/main'], { timeoutMs });

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

function existingAncestor(file) {
  let at = path.dirname(file);
  while (!fs.existsSync(at)) at = path.dirname(at);
  return at;
}

function enclosingRepo(target, env, owned = OWNED.map((name) => path.join(target, name))) {
  const parent = existingAncestor(target);
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
  const ignored = git(env, ['-C', top, 'check-ignore', '--', ...owned]);
  if (ignored.status !== 0 && ignored.status !== 1) throw new PalaceError(`git check-ignore failed in ${top}: ${ignored.stderr.trim()}. Nothing was written.`);
  return { top, allIgnored: ignored.stdout.split('\n').filter(Boolean).length === owned.length };
}

function projectRoot(env, cwd) {
  let result;
  try {
    result = git(env, ['-C', cwd, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'], { timeoutMs: PROJECT_ROOT_MS });
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (result.status !== 0) return null;
  const [top, common] = result.stdout.split('\n');
  return fs.realpathSync(path.basename(common) === '.git' ? path.dirname(common) : top);
}

module.exports = {
  projectRoot, hasRepo, online, unlink, init, clone, dropTracking, foreignPaths, foreignError, refuseForeignHead, checkRemote, fetchAndForward, clearStaleLocks, restore, commit, push, gc,
  carriesSecret, SECRET_URL, enclosingRepo,
};
