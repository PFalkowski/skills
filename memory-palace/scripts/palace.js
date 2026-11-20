'use strict';

const fs = require('node:fs');
const { PalaceError, UsageError, parseJson, describe } = require('./lib/errors.js');
const palace = require('./lib/palace.js');

const USAGE = 'usage: palace.js <status|setup|join|save|recall|browse|list|forget|sync|remote|check|unlock> [--palace <dir>] [--scope global|project]; places, titles, summaries and texts go on standard input as one JSON object';
const SECRET_OPTION = /^--(passphrase|password)(=|$)/;
const TAKES_INPUT = new Set(['setup', 'join', 'save', 'recall', 'browse', 'list', 'forget', 'remote']);

const OPTIONS = { '--palace': 'palace', '--scope': 'scope' };
const SCOPES = ['global', 'project'];
const BINDS = new Set(['setup', 'join']);

const COMMANDS = {
  status: (input, ctx) => palace.status(ctx),
  setup: (input, ctx) => palace.setup(ctx.palace, input, ctx),
  join: (input, ctx) => palace.join(ctx.palace, input, ctx),
  unlock: (input, ctx) => palace.unlock(ctx),
  ...Object.fromEntries(['save', 'recall', 'browse', 'list', 'forget', 'sync', 'check', 'remote'].map((name) => [name, (input, ctx) => palace.run(name, input, ctx)])),
};

function parseArgs([command, ...options]) {
  if (options.some((option) => SECRET_OPTION.test(option))) {
    throw new UsageError('a passphrase never goes on the command line. Give setup {"passphrase": {"env": "<variable name>"}} or {"passphrase": {"file": "<key file path>"}} on standard input.');
  }
  if (!Object.hasOwn(COMMANDS, command)) throw new UsageError(USAGE);
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

function main() {
  try {
    const { command, ...options } = parseArgs(process.argv.slice(2));
    const input = TAKES_INPUT.has(command) ? readInput() : {};
    process.stdout.write(`${JSON.stringify(COMMANDS[command](input, { env: process.env, cwd: process.cwd(), ...options }))}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${describe(err)}\n`);
    return err instanceof UsageError ? 2 : 1;
  }
}

process.exitCode = main();
