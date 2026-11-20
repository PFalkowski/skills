'use strict';

const fs = require('node:fs');
const { PalaceError, UsageError, parseJson, describe } = require('./lib/errors.js');
const palace = require('./lib/palace.js');
const hook = require('./lib/hook.js');

const USAGE = 'usage: palace.js <status|setup|join|save|recall|browse|list|forget|sync|remote|check|unlock|hook|remind> [--palace <dir>] [--scope global|project|session]; places, titles, summaries and texts go on standard input as one JSON object';
const SECRET_OPTION = /^--(passphrase|password)(=|$)/;
const TAKES_INPUT = new Set(['setup', 'join', 'save', 'recall', 'browse', 'list', 'forget', 'remote', 'hook']);

const OPTIONS = { '--palace': 'palace', '--scope': 'scope' };
const SCOPES = ['global', 'project', 'session'];
const BINDS = new Set(['setup', 'join']);
const NO_OPTIONS = new Set(['hook', 'remind']);

const COMMANDS = {
  status: (input, ctx) => (ctx.palace === undefined && ctx.scope === undefined ? { ...palace.status(ctx), hook: hook.state(ctx) } : palace.status(ctx)),
  setup: (input, ctx) => palace.setup(ctx.palace, input, ctx),
  join: (input, ctx) => palace.join(ctx.palace, input, ctx),
  unlock: (input, ctx) => palace.unlock(ctx),
  hook: (input, ctx) => hook.change(input, ctx),
  ...Object.fromEntries(['save', 'recall', 'browse', 'list', 'forget', 'sync', 'check', 'remote'].map((name) => [name, (input, ctx) => palace.run(name, input, ctx)])),
};

function parseArgs([command, ...options]) {
  if (options.some((option) => SECRET_OPTION.test(option))) {
    throw new UsageError('a passphrase never goes on the command line. Give setup {"passphrase": {"env": "<variable name>"}} or {"passphrase": {"file": "<key file path>"}} on standard input.');
  }
  if ((!Object.hasOwn(COMMANDS, command) && command !== 'remind') || (NO_OPTIONS.has(command) && options.length > 0)) throw new UsageError(USAGE);
  const parsed = { command };
  for (let i = 0; i < options.length; i += 2) {
    const name = Object.hasOwn(OPTIONS, options[i]) ? OPTIONS[options[i]] : undefined;
    if (!name || Object.hasOwn(parsed, name) || options[i + 1] === undefined) throw new UsageError(USAGE);
    parsed[name] = options[i + 1];
  }
  if (Object.hasOwn(parsed, 'scope') && !SCOPES.includes(parsed.scope)) throw new UsageError(USAGE);
  if (Object.hasOwn(parsed, 'scope') && Object.hasOwn(parsed, 'palace') && !BINDS.has(command)) {
    throw new UsageError('--scope and --palace go together only for setup and join; give one of them.');
  }
  if (parsed.scope === 'session' && BINDS.has(command)) throw new UsageError('a session palace needs no setup: save with --scope session');
  return parsed;
}

function readInput() {
  let input = null;
  try {
    input = parseJson(fs.readFileSync(0, 'utf8'), 'standard input');
  } catch (err) {
    if (!(err instanceof PalaceError)) throw err;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new UsageError('standard input is not one valid JSON object');
  return input;
}

function remind() {
  try {
    const reminder = hook.remind(fs.readFileSync(0, 'utf8'), process.env);
    if (reminder) process.stdout.write(`${reminder}\n`);
  } catch {}
  return 0;
}

function currentFolder() {
  try {
    return process.cwd();
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function main() {
  try {
    const { command, ...options } = parseArgs(process.argv.slice(2));
    if (command === 'remind') return remind();
    const input = TAKES_INPUT.has(command) ? readInput() : {};
    process.stdout.write(`${JSON.stringify(COMMANDS[command](input, { env: process.env, cwd: currentFolder(), script: process.argv[1], ...options }))}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${describe(err)}\n`);
    return err instanceof UsageError ? 2 : 1;
  }
}

process.exitCode = main();
