'use strict';

const os = require('node:os');
const path = require('node:path');

const home = (env) => env.HOME || os.homedir();

const configDir = (env) => path.resolve(env.XDG_CONFIG_HOME || path.join(home(env), '.config'), 'memory-palace');

const machineKeyFile = (env) => path.join(configDir(env), 'key');

const globalFolder = (env) => path.resolve(env.XDG_DATA_HOME || path.join(home(env), '.local', 'share'), 'memory-palace', 'global');

module.exports = { configDir, machineKeyFile, globalFolder };
