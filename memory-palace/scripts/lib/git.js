'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PalaceError } = require('./errors.js');

const LOCATION_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR',
];
const OWNED = ['palace.json', 'meta', path.join('pages', '00', '0'), 'palace.db', '.gitignore'];

function scrubbed(env) {
  const clean = { ...env };
  for (const name of LOCATION_VARIABLES) delete clean[name];
  return clean;
}

function git(env, args) {
  const result = spawnSync('git', args, { env: scrubbed(env), encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
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

module.exports = { enclosingRepo };
