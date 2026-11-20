'use strict';

const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const git = require('./git.js');

const home = (env) => env.HOME || os.homedir();

const configDir = (env) => path.resolve(env.XDG_CONFIG_HOME || path.join(home(env), '.config'), 'memory-palace');

const machineKeyFile = (env) => path.join(configDir(env), 'key');

const dataDir = (env) => path.resolve(env.XDG_DATA_HOME || path.join(home(env), '.local', 'share'), 'memory-palace');

const projectName = (root) => `${path.basename(root).slice(0, 40)}-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)}`;

const defaultFolder = (scope, env, root) =>
  (scope === 'project' ? path.join(dataDir(env), 'projects', projectName(root)) : path.join(dataDir(env), 'global'));

const projectRoot = (env, cwd) => git.projectRoot(env, cwd) ?? cwd;

module.exports = { configDir, machineKeyFile, defaultFolder, projectRoot };
