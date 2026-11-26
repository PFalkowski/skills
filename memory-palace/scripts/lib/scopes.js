'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const git = require('./git.js');
const { PalaceError } = require('./errors.js');

const home = (env) => env.HOME || os.homedir();

const configDir = (env) => path.resolve(env.XDG_CONFIG_HOME || path.join(home(env), '.config'), 'memory-palace');

const machineKeyFile = (env) => path.join(configDir(env), 'key');

const dataDir = (env) => path.resolve(env.XDG_DATA_HOME || path.join(home(env), '.local', 'share'), 'memory-palace');

const projectName = (root) => `${path.basename(root).slice(0, 40)}-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)}`;

const defaultFolder = (scope, env, root) =>
  (scope === 'project' ? path.join(dataDir(env), 'projects', projectName(root)) : path.join(dataDir(env), 'global'));

function projectRoot(env, cwd) {
  if (cwd === null) throw new PalaceError('the current folder no longer exists, so it has no project scope. Change to an existing folder, or use --scope global. Nothing was changed.');
  return git.projectRoot(env, cwd) ?? cwd;
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

const sessionId = (env) => (SESSION_ID.test(env.CLAUDE_CODE_SESSION_ID ?? '') ? env.CLAUDE_CODE_SESSION_ID : null);

function sessionBase(env) {
  if (env.XDG_RUNTIME_DIR) return path.resolve(env.XDG_RUNTIME_DIR, 'memory-palace');
  let user;
  try {
    user = os.userInfo().username;
  } catch {
    user = process.getuid();
  }
  return path.join(os.tmpdir(), `memory-palace-${user}`);
}

const isPrivate = (stat) => process.platform === 'win32' || (stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0);

function makeDir(dir) {
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

function sessionFolder(env, create) {
  if (sessionId(env) === null) {
    const why = env.CLAUDE_CODE_SESSION_ID ? 'is not a valid session id' : 'is not set';
    throw new PalaceError(`the session scope needs a session id, and CLAUDE_CODE_SESSION_ID ${why}. Use --scope project or --scope global.`);
  }
  const base = sessionBase(env);
  const sessions = path.join(base, 'sessions');
  const folder = path.join(sessions, env.CLAUDE_CODE_SESSION_ID);
  if (create) fs.mkdirSync(path.dirname(base), { recursive: true, mode: 0o700 });
  for (const dir of [base, sessions, folder]) {
    if (create && dir !== folder) makeDir(dir);
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (!stat) return create ? folder : null;
    if (!isPrivate(stat)) throw new PalaceError(`${dir} is not a private folder of the current user (it is a link, owned by another user, or open to others). Nothing was changed.`);
  }
  return folder;
}

module.exports = { home, configDir, machineKeyFile, defaultFolder, projectRoot, sessionId, sessionFolder };
