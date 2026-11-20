'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { PalaceError, UsageError } = require('./errors.js');
const { home, projectRoot } = require('./scopes.js');
const { readMachine, readSettings } = require('./palace.js');

const PLAIN_KIND = /^[a-z][a-z0-9-]{0,31}$/;
const MOMENT_PHRASES = { 'on-request': 'when the user asks', 'after-decision': 'after a decision', 'end-of-task': 'at the end of a task' };
const HEADER = 'memory-palace: the user keeps a memory palace on this machine. Load the memory-palace skill to save to it or recall from it.';

const settingsFile = (env) => path.join(env.CLAUDE_CONFIG_DIR || path.join(home(env), '.claude'), 'settings.json');

const isOwn = (handler) =>
  handler?.type === 'command' && Array.isArray(handler.args) && handler.args.length === 2 && handler.args.every((arg) => typeof arg === 'string') &&
  path.basename(handler.args[0]) === 'palace.js' && handler.args[1] === 'remind';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const ownHandlers = (settings) => (settings.hooks?.SessionStart ?? []).flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks.filter(isOwn) : []));

const knownShape = (settings) =>
  isObject(settings) && (settings.hooks === undefined || isObject(settings.hooks)) &&
  (settings.hooks?.SessionStart === undefined || Array.isArray(settings.hooks.SessionStart));

function readSettingsFile(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {}
  if (!knownShape(settings)) {
    throw new PalaceError(`the Claude Code settings file ${file} is not valid JSON, or its hooks have a shape memory-palace does not know, so memory-palace will not change it. Nothing was changed.`);
  }
  return settings;
}

function state(ctx) {
  try {
    const own = ownHandlers(readSettingsFile(settingsFile(ctx.env)));
    if (own.some((handler) => handler.args[0] === ctx.script)) return 'installed';
    return own.length > 0 ? 'stale' : 'absent';
  } catch {
    return 'absent';
  }
}

function withoutOwn(settings) {
  if (settings.hooks === undefined) return settings;
  const { SessionStart = [], ...others } = settings.hooks;
  const groups = SessionStart.flatMap((group) => {
    if (!Array.isArray(group?.hooks) || !group.hooks.some(isOwn)) return [group];
    const kept = group.hooks.filter((handler) => !isOwn(handler));
    return kept.length > 0 ? [{ ...group, hooks: kept }] : [];
  });
  const hooks = groups.length > 0 ? { ...settings.hooks, SessionStart: groups } : others;
  const next = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  return next;
}

function withOwn(settings, handler) {
  const own = ownHandlers(settings);
  if (own.length === 1 && isDeepStrictEqual(own[0], handler)) return settings;
  const stripped = withoutOwn(settings);
  const hooks = stripped.hooks ?? {};
  return { ...stripped, hooks: { ...hooks, SessionStart: [...(hooks.SessionStart ?? []), { hooks: [handler] }] } };
}

function writeSettings(file, value) {
  const old = fs.statSync(file, { throwIfNoEntry: false });
  const real = old ? fs.realpathSync(file) : file;
  if (!old) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const mode = old ? old.mode & 0o777 : 0o600;
  const temp = path.join(path.dirname(real), `.settings.json.${crypto.randomBytes(8).toString('hex')}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode });
  fs.chmodSync(temp, mode);
  fs.renameSync(temp, real);
}

function change(input, ctx) {
  if (input.action !== 'install' && input.action !== 'remove') throw new UsageError('hook needs {"action": "install"} or {"action": "remove"}');
  const file = settingsFile(ctx.env);
  const settings = readSettingsFile(file);
  const next = input.action === 'install' ? withOwn(settings, { type: 'command', command: 'node', args: [ctx.script, 'remind'], timeout: 10 }) : withoutOwn(settings);
  const changed = !isDeepStrictEqual(next, settings);
  if (changed) writeSettings(file, next);
  return { hook: input.action === 'install' ? 'installed' : 'absent', changed, settings: file };
}

function reminderLine(scope, dir) {
  const { kinds, moments } = readSettings(dir);
  if (moments.length === 0) return [];
  const shown = kinds.every((kind) => PLAIN_KIND.test(kind)) ? kinds.join(', ') : 'that `status` shows';
  return [`${scope} palace: save things of kinds ${shown}: ${moments.map((moment) => MOMENT_PHRASES[moment]).join('; ')}.`];
}

function remind(text, env) {
  const { cwd } = JSON.parse(text);
  if (typeof cwd !== 'string') throw new PalaceError('the hook input has no cwd');
  const machine = readMachine(env);
  const project = machine.projects[projectRoot(env, cwd)];
  const lines = [['global', machine.default], ['project', project]].flatMap(([scope, dir]) => (dir ? reminderLine(scope, dir) : []));
  return lines.length > 0 ? [HEADER, ...lines].join('\n') : '';
}

module.exports = { state, change, remind };
