#!/usr/bin/env node
// One-time installer: copy statusline.js into the Claude Code config dir and
// wire it up as the `statusLine` command in settings.json.
//
//   node install.mjs [--force] [--dry-run]
//
// --force    replace an existing statusLine that points somewhere else
// --dry-run  print what would change, touch nothing

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry-run');

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'statusline.js');

// Claude Code honours CLAUDE_CONFIG_DIR; fall back to the documented default.
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const target = path.join(configDir, 'statusline.js');
const settingsPath = path.join(configDir, 'settings.json');

// Forward slashes even on Windows: node accepts them, and they survive a trip
// through JSON and a shell without backslash-escaping games.
const command = `node "${target.split(path.sep).join('/')}"`;

const log = (s) => process.stdout.write(s + '\n');
const die = (s) => {
  process.stderr.write('✗ ' + s + '\n');
  process.exit(1);
};

if (!fs.existsSync(source)) die(`missing ${source}`);
if (!fs.existsSync(configDir)) die(`no Claude Code config dir at ${configDir}`);

// Does an existing statusLine command already point at our target file? Compare
// resolved paths, not raw strings — a hand-written entry may differ only by
// quoting or slash direction and still be the very same file.
function pointsAtTarget(cmd) {
  if (typeof cmd !== 'string') return false;
  const norm = (s) => {
    const t = s.replace(/["']/g, '').split('\\').join('/').trim();
    return process.platform === 'win32' ? t.toLowerCase() : t;
  };
  return norm(cmd).includes(norm(target));
}

// --- settings.json: read, validate, merge -----------------------------------
let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, 'utf8');
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    die(`${settingsPath} is not valid JSON (${e.message}) — fix it first, refusing to overwrite`);
  }
  const existing = settings.statusLine?.command;
  if (settings.statusLine && !pointsAtTarget(existing) && !FORCE) {
    const msg =
      `settings.json already has a different statusLine:\n    ${JSON.stringify(settings.statusLine)}\n` +
      `  Re-run with --force to replace it.`;
    if (DRY) log('! ' + msg);
    else die(msg);
  }
}

const already = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === fs.readFileSync(source, 'utf8');
const wired = pointsAtTarget(settings.statusLine?.command);

if (DRY) {
  log(`would copy   ${source}`);
  log(`          -> ${target}${already ? '  (identical, no change)' : ''}`);
  log(`would set    statusLine.command = ${command}${wired ? '  (already set)' : ''}`);
  log(`in           ${settingsPath}`);
  process.exit(0);
}

fs.copyFileSync(source, target);
log(`✓ installed  ${target}`);

if (!wired) {
  if (fs.existsSync(settingsPath)) {
    // Timestamped so repeated runs never clobber an earlier backup.
    const backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(settingsPath, backup);
    log(`✓ backed up  ${backup}`);
  }
  settings.statusLine = { type: 'command', command };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  log(`✓ wired      statusLine in ${settingsPath}`);
} else {
  log(`= already    wired in ${settingsPath}`);
}

log('');
log('Restart Claude Code (or `claude --resume`) to pick it up.');
log('Settings are read at startup, so a session already open will not show it.');
log('Later edits to statusline.js apply live — the command re-runs every render.');
