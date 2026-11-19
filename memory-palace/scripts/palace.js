'use strict';

const fs = require('node:fs');
const { PalaceError, parseJson, describe } = require('./lib/errors.js');
const palace = require('./lib/palace.js');

class UsageError extends PalaceError {}

const USAGE = 'usage: palace.js <status|setup|join|save|recall|browse|list|forget|sync|remote|check|unlock> [--palace <dir>]; places, titles, summaries and texts go on standard input as one JSON object';
const SECRET_OPTION = /^--(passphrase|password)(=|$)/;
const TAKES_INPUT = new Set(['setup', 'join', 'save', 'recall', 'browse', 'list', 'forget', 'remote']);

const inOpenPalace = (operation) => (input, ctx) => palace.open(ctx)[operation](input);

const COMMANDS = {
  status: (input, ctx) => palace.status(ctx),
  setup: (input, ctx) => palace.setup(ctx.palace, input, ctx),
  join: (input, ctx) => palace.join(ctx.palace, input, ctx),
  unlock: (input, ctx) => palace.unlock(ctx),
  ...Object.fromEntries(['save', 'recall', 'browse', 'list', 'forget', 'sync', 'check'].map((name) => [name, inOpenPalace(name)])),
  remote: inOpenPalace('setRemote'),
};

function parseArgs([command, ...options]) {
  if (options.some((option) => SECRET_OPTION.test(option))) {
    throw new UsageError('a passphrase never goes on the command line. Give setup {"passphrase": {"env": "<variable name>"}} or {"passphrase": {"file": "<key file path>"}} on standard input.');
  }
  if (!Object.hasOwn(COMMANDS, command)) throw new UsageError(USAGE);
  if (options.length === 2 && options[0] === '--palace') return { command, palace: options[1] };
  if (options.length > 0) throw new UsageError(USAGE);
  if (command === 'setup' || command === 'join') throw new UsageError(`${command} needs --palace <dir>`);
  return { command };
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
    const { command, palace: dir } = parseArgs(process.argv.slice(2));
    const input = TAKES_INPUT.has(command) ? readInput() : {};
    process.stdout.write(`${JSON.stringify(COMMANDS[command](input, { env: process.env, palace: dir }))}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${describe(err)}\n`);
    return err instanceof UsageError ? 2 : 1;
  }
}

process.exitCode = main();
